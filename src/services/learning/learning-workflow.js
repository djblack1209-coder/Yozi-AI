import {
  LEARNING_WORKFLOW_CONTRACT,
  LEARNING_WORKFLOW_CONCURRENCY,
  normalizeWorkflowPlan,
  workflowPlanDigest,
  workflowRequestId
} from '../../../laf-backend/functions/_shared/learning-workflow.js';
import { SINGLE_QUESTION_CONTRACT } from '../../../laf-backend/functions/_shared/learning-intake.js';
import { fetchLearningResult, generateLearningTurn } from '../api/domains/learning.api.js';
import { userDirective } from './learning-tools.js';
export {
  LEARNING_WORKFLOW_CONTRACT,
  requestsLearningWorkflow
} from '../../../laf-backend/functions/_shared/learning-workflow.js';

const requireValue = (value, message) => {
  if (!value) throw Object.assign(new Error(message), { code: 'CONTEXT_CHANGED' });
};
const incomplete = () => ({
  success: false,
  code: 409,
  status: 'workflow_incomplete',
  error: 'WORKFLOW_INCOMPLETE',
  workflowCanContinue: true,
  message: '已保留完成的分工结果，可明确继续剩余步骤。'
});

// Lifecycle controls do not change a read-only workflow's frozen question or model input.
// Their confirmed source/proposal messages are the only later user text accepted here.
export function workflowRecoveryContextMatches(state, request) {
  const conversation = state.conversations.find((item) => item.id === request.conversationId);
  const index = state.events.findIndex((event) => event.id === `${request.requestId}:request`);
  const original = conversation?.messages.find((message) => message.id === request.messageId);
  if (
    request.workflowContract !== LEARNING_WORKFLOW_CONTRACT ||
    conversation?.entryContract !== SINGLE_QUESTION_CONTRACT ||
    original?.role !== 'user' ||
    index < 0 ||
    state.events[index].type !== 'model.request' ||
    state.events[index].data.workflowContract !== LEARNING_WORKFLOW_CONTRACT ||
    state.events[index].data.messageId !== request.messageId
  )
    return false;
  const tail = state.events.slice(index + 1);
  const lifecycle = new Set(['task.stop', 'task.resume', 'goal.pause', 'goal.resume', 'goal.close', 'goal.reopen']);
  const allowed = new Set([`${request.requestId}:error`, `${request.requestId}:reply`]);
  const controls = tail.filter(
    (event) => lifecycle.has(event.type) && event.data.conversationId === request.conversationId
  );
  for (const control of controls) {
    allowed.add(control.id);
    if (control.type.startsWith('goal.') && control.data.proposalId) {
      const message = conversation.messages.find((item) => item.id === control.data.proposalId);
      if (control.data.explicit !== true || message?.proposal?.type !== control.type) return false;
      allowed.add(message.id);
      for (const ref of message.proposal.sourceRefs || [])
        if (ref.conversationId === request.conversationId) allowed.add(ref.messageId);
    }
    if (control.type.startsWith('task.') && control.id.endsWith(':directive')) {
      const root = control.id.slice(0, -':directive'.length);
      const message = conversation.messages.find((item) => item.id === `${root}:message`);
      if (
        message?.role !== 'user' ||
        userDirective(message.content, state, request.conversationId)?.type !== control.type
      )
        return false;
      allowed.add(message.id);
      allowed.add(`${root}:updated`);
    }
  }
  const notices = { 'task.stop': '当前任务已停止。', 'task.resume': '已继续学习。' };
  return (
    tail.every((event, position) => {
      if (allowed.has(event.id) || event.id.startsWith(`${request.requestId}:tool:`)) return true;
      const previous = tail[position - 1];
      return (
        controls.includes(previous) &&
        event.type === 'message.add' &&
        event.data.conversationId === request.conversationId &&
        event.data.role === 'notice' &&
        notices[previous.type] === event.data.content
      );
    }) &&
    [request.messageId, ...allowed].includes(
      conversation.messages.filter((message) => message.role === 'user').at(-1)?.id
    )
  );
}

export function createLearningWorkflowRunner({ read, generate }) {
  return async function run(payload, options = {}) {
    const mode = options.workflowMode || 'start';
    requireValue(['start', 'read', 'continue'].includes(mode), '分工读取方式不合法');
    const current = () => {
      options.assertCurrent?.();
      if (options.signal?.aborted) throw Object.assign(new Error('分工已取消，未启动新步骤'), { code: 'CANCELLED' });
    };
    const report = (phase, completed = 0, total = 0) => {
      current();
      options.onWorkflowProgress?.({ phase, completed, total });
    };
    const stagePayload = (stage, taskId) => ({
      requestId: stage === 'plan' ? payload.requestId : workflowRequestId(payload.requestId, taskId || 'final'),
      requestBinding: payload.requestBinding,
      modelId: payload.modelId,
      shareConsent: payload.shareConsent,
      presentationContract: payload.presentationContract,
      messages: stage === 'plan' ? [payload.messages.at(-1)] : [{ role: 'user', content: '继续原分工的明确步骤。' }],
      learningContext: {
        owner: payload.learningContext.owner,
        generalQAOnly: true,
        questionEntryContract: SINGLE_QUESTION_CONTRACT,
        workflow: {
          contract: LEARNING_WORKFLOW_CONTRACT,
          stage,
          ...(stage === 'plan' ? {} : { parentId: payload.requestId }),
          ...(stage === 'agent' ? { taskId } : {})
        }
      }
    });
    const invoke = async (stage, taskId) => {
      current();
      const request = stagePayload(stage, taskId);
      let result = await read(request.requestId, options);
      current();
      if (result.code === 404 && mode !== 'read') {
        requireValue(payload.shareConsent === true, '请先允许本次问题发送至所选连接');
        result = await generate(request, { ...options, stream: false });
        current();
      }
      if (!result.success) return result;
      const data = result.data;
      requireValue(
        data?.requestId === request.requestId &&
          data.requestBinding === payload.requestBinding &&
          data.modelId === payload.modelId &&
          (!options.expectedModel || data.model === options.expectedModel) &&
          data.workflowReceipt?.contract === LEARNING_WORKFLOW_CONTRACT &&
          data.workflowReceipt.stage === stage &&
          data.workflowReceipt.parentId === payload.requestId &&
          (stage !== 'agent' || data.workflowReceipt.taskId === taskId),
        '分工结果与原问题、连接或任务关联不一致'
      );
      return result;
    };
    report('planning');
    const parent = await invoke('plan');
    if (!parent.success) return parent;
    if (parent.data.workflowCancelled)
      return {
        success: false,
        code: 499,
        status: 'cancelled',
        error: 'CANCELLED',
        message: '原分工已取消，结果保留供查看。'
      };
    const saved = parent.data.workflow;
    requireValue(
      saved?.contract === LEARNING_WORKFLOW_CONTRACT &&
        saved.stage === 'plan' &&
        saved.parentId === payload.requestId &&
        saved.binding === payload.requestBinding &&
        saved.input === payload.messages.at(-1)?.content,
      '原分工计划或原问题已变化'
    );
    const plan = normalizeWorkflowPlan(saved.plan),
      digest = workflowPlanDigest(plan),
      done = new Set();
    const stageResults = new Map();
    report('agents', 0, plan.tasks.length);
    // Explicit dependency waves, two at a time. A failed wave is fully observed before returning.
    while (done.size < plan.tasks.length) {
      const ready = plan.tasks
        .filter((task) => !done.has(task.id) && task.dependsOn.every((id) => done.has(id)))
        .slice(0, LEARNING_WORKFLOW_CONCURRENCY);
      requireValue(ready.length, '原分工依赖无法继续');
      const results = await Promise.allSettled(ready.map((task) => invoke('agent', task.id)));
      let failure = null;
      for (const [index, observed] of results.entries()) {
        if (observed.status === 'rejected') {
          failure ||= observed.reason;
          continue;
        }
        const result = observed.value;
        if (!result.success) {
          failure ||= result.code === 404 && mode === 'read' ? incomplete() : result;
          continue;
        }
        requireValue(result.data.workflowReceipt.planDigest === digest, '子任务属于另一份分工计划');
        done.add(ready[index].id);
        stageResults.set(ready[index].id, result);
      }
      if (failure) {
        if (failure instanceof Error) throw failure;
        return failure;
      }
      report('agents', done.size, plan.tasks.length);
    }
    report('synthesis', done.size, plan.tasks.length);
    const final = await invoke('final');
    if (!final.success) return final.code === 404 && mode === 'read' ? incomplete() : final;
    requireValue(final.data.workflowReceipt.planDigest === digest, '汇总属于另一份分工计划');
    return {
      ...final,
      data: {
        ...final.data,
        requestId: payload.requestId,
        workflowReceipt: {
          contract: LEARNING_WORKFLOW_CONTRACT,
          stage: 'complete',
          parentId: payload.requestId,
          planDigest: digest,
          taskRequestIds: plan.tasks.map((task) => workflowRequestId(payload.requestId, task.id)),
          finalRequestId: final.data.requestId,
          completedTasks: done.size,
          reusedTasks: [...stageResults.values()].filter((result) => result.reused).length
        }
      }
    };
  };
}

export const runLearningWorkflow = createLearningWorkflowRunner({
  read: fetchLearningResult,
  generate: generateLearningTurn
});
