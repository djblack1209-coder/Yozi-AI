import {
  LEARNING_WORKFLOW_CONTRACT,
  LEARNING_WORKFLOW_CONCURRENCY,
  normalizeWorkflowPlan,
  workflowPlanDigest,
  workflowRequestId
} from '../../../laf-backend/functions/_shared/learning-workflow.js';
import { SINGLE_QUESTION_CONTRACT } from '../../../laf-backend/functions/_shared/learning-intake.js';
import { fetchLearningResult, generateLearningTurn } from '../api/domains/learning.api.js';
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
