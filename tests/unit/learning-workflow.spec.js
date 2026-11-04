import { describe, it, expect, vi } from 'vitest';
import {
  LEARNING_WORKFLOW_CONTRACT as contract,
  normalizeWorkflowEnvelope,
  normalizeWorkflowPlan,
  workflowRequestId,
  workflowPlanDigest,
  workflowStageContext,
  parseWorkflowPlan,
  parseWorkflowAgent,
  cancelWorkflowCalls
} from '../../laf-backend/functions/_shared/learning-workflow.js';
import { newAccount, reserveCall, settleCall, cancelCall } from '../../laf-backend/functions/_shared/learning-account';
import { createLearningWorkflowRunner } from '@/services/learning/learning-workflow.js';
import { PRESENTATION_CONTRACT } from '../../laf-backend/functions/_shared/learning-content-blocks.js';

const plan = {
  tasks: [
    { id: 'tone', title: '语气', instruction: '分析两种开头的语气差异。', dependsOn: [] },
    { id: 'coverage', title: '覆盖', instruction: '分析两种开头的任务覆盖。', dependsOn: [] },
    { id: 'check', title: '复核语气', instruction: '核对语气结论的依据。', dependsOn: ['tone'] }
  ]
};
const input = '多角度分析：比较两种邮件开头，分别说明语气和任务覆盖。';
const identity = {
  requestId: 'workflow_root_1',
  binding: 'workflow_binding_1',
  modelId: 'fixture-connection',
  model: 'fixture-model',
  connectionVersion: 'fixture-version',
  messages: [{ role: 'user', content: input }]
};
const envelope = (stage, taskId) => ({
  contract,
  stage,
  ...(stage === 'plan' ? {} : { parentId: identity.requestId }),
  ...(stage === 'agent' ? { taskId } : {})
});
const rawPlan = (value = plan) =>
  JSON.stringify({ message: '分别分析后汇总。', question: null, tools: [], workflow: value });
const rootContext = () => workflowStageContext([], envelope('plan'), identity);
function stageIdentity(id) {
  return { ...identity, requestId: workflowRequestId(identity.requestId, id) };
}
function reservation(id, metadata) {
  return {
    id,
    fingerprint: 'fingerprint_' + id,
    source: 'byok',
    provider: 'fixture',
    model: identity.model,
    modelId: identity.modelId,
    configurationVersion: 'fixture-version',
    connectionVersion: identity.connectionVersion,
    requestBinding: identity.binding,
    maxCost: 0,
    units: 0,
    callLimit: 500,
    budgetPhase: 'practice',
    workflow: metadata
  };
}
const usage = { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 };
function complete(account, id, result) {
  return settleCall(account, id, {
    success: true,
    actualCost: null,
    usage,
    actualModel: identity.model,
    durationMs: 1,
    result
  }).account;
}
function rootAccount(value = plan) {
  const context = rootContext();
  const account = reserveCall(newAccount('workflow-owner'), reservation(identity.requestId, context.metadata)).account;
  const result = {
    ...parseWorkflowPlan(rawPlan(value), context, identity),
    requestId: identity.requestId,
    requestBinding: identity.binding,
    modelId: identity.modelId,
    model: identity.model,
    workflowReceipt: context.metadata
  };
  return complete(account, identity.requestId, result);
}
function completeAgent(account, id, message = '分析 ' + id) {
  const context = workflowStageContext(account.calls, envelope('agent', id), stageIdentity(id));
  account = reserveCall(account, reservation(stageIdentity(id).requestId, context.metadata)).account;
  return complete(account, stageIdentity(id).requestId, {
    message,
    question: null,
    tools: [],
    structured: true,
    workflowReceipt: context.metadata
  });
}

describe('S52 protected task graph and account reservation', () => {
  it('keeps a model-authored dependency graph and sends only the declared predecessor to a child', () => {
    let account = completeAgent(rootAccount(), 'tone', 'ONLY_TONE_RESULT');
    account = completeAgent(account, 'coverage', 'UNRELATED_COVERAGE_RESULT');
    const child = workflowStageContext(account.calls, envelope('agent', 'check'), stageIdentity('check'));
    expect(JSON.parse(child.content)).toEqual({
      input,
      task: { title: '复核语气', instruction: '核对语气结论的依据。' },
      results: [{ id: 'tone', title: '语气', result: 'ONLY_TONE_RESULT' }]
    });
    expect(child.content).not.toContain('UNRELATED_COVERAGE_RESULT');
    expect(child.metadata.planDigest).toBe(workflowPlanDigest(plan));
  });

  it.each([
    { tasks: [plan.tasks[0]] },
    { tasks: [plan.tasks[0], plan.tasks[0]] },
    { tasks: [plan.tasks[0], { ...plan.tasks[1], dependsOn: ['missing'] }] },
    {
      tasks: [
        { ...plan.tasks[0], dependsOn: ['coverage'] },
        { ...plan.tasks[1], dependsOn: ['tone'] }
      ]
    },
    { tasks: [plan.tasks[0], { ...plan.tasks[1], model: 'other-credential' }] },
    { tasks: [plan.tasks[0], { ...plan.tasks[1], id: 'final' }] }
  ])('rejects ambiguous, cyclic or authority-bearing graph %# before execution', (value) => {
    expect(() => normalizeWorkflowPlan(value)).toThrow();
  });

  it.each([
    { contract, stage: 'agent', parentId: identity.requestId, taskId: 'tone', model: 'other' },
    { contract, stage: 'plan', parentId: identity.requestId },
    { contract, stage: 'final', parentId: identity.requestId, taskId: 'tone' },
    { contract: 'unknown', stage: 'plan' }
  ])('rejects undeclared stage input %#', (value) => expect(() => normalizeWorkflowEnvelope(value)).toThrow());

  it.each([
    'broken JSON',
    JSON.stringify({ message: '写入成功', question: null, tools: [{ name: 'plan', arguments: {} }] }),
    JSON.stringify({ message: '分析', question: null, tools: [], workflow: plan })
  ])('rejects worker output that is incomplete or requests authority %#', (raw) => {
    expect(() => parseWorkflowAgent(raw)).toThrow();
  });

  it('requires a complete planner object and refuses extra permissions', () => {
    expect(() => parseWorkflowPlan(rawPlan().slice(0, -1), rootContext(), identity)).toThrow();
    const parsed = JSON.parse(rawPlan());
    parsed.permissions = ['write'];
    expect(() => parseWorkflowPlan(JSON.stringify(parsed), rootContext(), identity)).toThrow();
    expect(parseWorkflowAgent('{"message":"待核对分析","question":null,"tools":[]}').tools).toEqual([]);
  });

  it.each([
    { binding: 'another_binding' },
    { modelId: 'another-connection' },
    { model: 'another-model' },
    { connectionVersion: 'changed-key-version' }
  ])('blocks child creation after original context changes %#', (patch) => {
    const account = rootAccount();
    expect(() =>
      workflowStageContext(account.calls, envelope('agent', 'tone'), { ...stageIdentity('tone'), ...patch })
    ).toThrow(/变化/u);
    expect(account.calls).toHaveLength(1);
  });

  it('does not resolve another owner, an expired parent, or an undeclared child identifier', () => {
    expect(() =>
      workflowStageContext(newAccount('another-owner').calls, envelope('agent', 'tone'), stageIdentity('tone'))
    ).toThrow();
    const account = rootAccount();
    expect(() =>
      workflowStageContext(account.calls, envelope('agent', 'tone'), stageIdentity('tone'), () => false)
    ).toThrow();
    expect(() =>
      workflowStageContext(account.calls, envelope('agent', 'tone'), { ...identity, requestId: 'duplicate_child' })
    ).toThrow(/编号/u);
    expect(account.calls).toHaveLength(1);
  });

  it('enforces the two-child ceiling inside the same account CAS reservation', () => {
    const independent = { tasks: plan.tasks.map((task) => ({ ...task, dependsOn: [] })) };
    let account = rootAccount(independent);
    for (const id of ['tone', 'coverage']) {
      const child = workflowStageContext(account.calls, envelope('agent', id), stageIdentity(id));
      account = reserveCall(account, reservation(stageIdentity(id).requestId, child.metadata)).account;
    }
    const next = workflowStageContext(account.calls, envelope('agent', 'check'), stageIdentity('check'));
    const original = structuredClone(account);
    expect(() => reserveCall(account, reservation(stageIdentity('check').requestId, next.metadata))).toThrow(/两个/u);
    expect(account).toEqual(original);
  });

  it('cannot reserve a dependent child or final synthesis before actual cached predecessors', () => {
    const account = rootAccount();
    expect(() => workflowStageContext(account.calls, envelope('agent', 'check'), stageIdentity('check'))).toThrow();
    expect(() => workflowStageContext(account.calls, envelope('final'), stageIdentity('final'))).toThrow();
    let done = completeAgent(account, 'tone');
    done = completeAgent(done, 'coverage');
    done = completeAgent(done, 'check');
    expect(
      JSON.parse(workflowStageContext(done.calls, envelope('final'), stageIdentity('final')).content).results
    ).toHaveLength(3);
  });

  it('rechecks cancellation between child preparation and reservation and retains original costs/results', () => {
    let account = completeAgent(rootAccount(), 'coverage');
    const prepared = workflowStageContext(account.calls, envelope('agent', 'tone'), stageIdentity('tone'));
    const originalCalls = structuredClone(account.calls);
    account = cancelWorkflowCalls(account, identity.requestId, cancelCall).account;
    expect(() => reserveCall(account, reservation(stageIdentity('tone').requestId, prepared.metadata))).toThrow();
    expect(account.calls.map(({ workflowCancelledAt: _flag, ...call }) => call)).toEqual(originalCalls);
    expect(account.calls[0].workflowCancelledAt).toBeTypeOf('number');
    expect(account.calls[0].status).toBe('completed');
    expect(account.calls[1].usage).toEqual(usage);
    expect(account.calls[1].costStatus).toBe('pending');
  });

  it('cancels existing children and preserves independent same-owner calls', () => {
    let account = rootAccount();
    const child = workflowStageContext(account.calls, envelope('agent', 'tone'), stageIdentity('tone'));
    account = reserveCall(account, reservation(stageIdentity('tone').requestId, child.metadata)).account;
    account = reserveCall(account, { ...reservation('independent_call', undefined), workflow: undefined }).account;
    const cancelled = cancelWorkflowCalls(account, identity.requestId, cancelCall);
    expect(cancelled.requestIds).toEqual([identity.requestId, stageIdentity('tone').requestId]);
    expect(
      cancelled.account.calls.find((call) => call.id === stageIdentity('tone').requestId).cancelRequestedAt
    ).toBeTruthy();
    expect(cancelled.account.calls.find((call) => call.id === 'independent_call').cancelRequestedAt).toBeUndefined();
  });
});

function runnerFixture() {
  const saved = new Map();
  const generated = [];
  const payload = {
    requestId: identity.requestId,
    requestBinding: identity.binding,
    modelId: identity.modelId,
    shareConsent: true,
    presentationContract: PRESENTATION_CONTRACT,
    messages: identity.messages,
    learningContext: { owner: 'workflow-owner' }
  };
  const data = (body) => {
    const stage = body.learningContext.workflow;
    return {
      success: true,
      data: {
        requestId: body.requestId,
        requestBinding: identity.binding,
        modelId: identity.modelId,
        model: identity.model,
        message: '分析 ' + (stage.taskId || stage.stage),
        question: null,
        tools: [],
        workflowReceipt: {
          contract,
          stage: stage.stage,
          parentId: identity.requestId,
          ...(stage.taskId ? { taskId: stage.taskId } : {}),
          ...(stage.stage === 'plan' ? {} : { planDigest: workflowPlanDigest(plan) })
        },
        ...(stage.stage === 'plan'
          ? {
              workflow: {
                contract,
                stage: 'plan',
                parentId: identity.requestId,
                binding: identity.binding,
                input,
                plan
              }
            }
          : {})
      }
    };
  };
  const read = vi.fn(async (id) =>
    saved.has(id) ? { ...structuredClone(saved.get(id)), reused: true } : { success: false, code: 404 }
  );
  const generate = vi.fn(async (body) => {
    generated.push(body);
    const result = data(body);
    saved.set(body.requestId, structuredClone(result));
    return result;
  });
  return {
    saved,
    generated,
    payload,
    read,
    generate,
    data,
    run: (options) =>
      createLearningWorkflowRunner({ read, generate })(payload, { expectedModel: identity.model, ...options })
  };
}
describe('S52 client workflow scheduling and recovery', () => {
  it('launches independent contexts in parallel, waits for dependencies and then synthesizes once', async () => {
    const f = runnerFixture(),
      releases = [];
    const normal = f.generate.getMockImplementation();
    f.generate.mockImplementation(async (body) => {
      if (body.learningContext.workflow.stage === 'agent' && body.learningContext.workflow.taskId !== 'check')
        await new Promise((resolve) => releases.push(resolve));
      return normal(body);
    });
    const pending = f.run();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(f.generate.mock.calls.map(([body]) => body.learningContext.workflow.stage)).toEqual([
      'plan',
      'agent',
      'agent'
    ]);
    releases.forEach((release) => release());
    expect(await pending).toMatchObject({
      success: true,
      data: {
        requestId: identity.requestId,
        workflowReceipt: { completedTasks: 3, finalRequestId: workflowRequestId(identity.requestId) }
      }
    });
    expect(
      f.generated.map((body) => body.learningContext.workflow.taskId || body.learningContext.workflow.stage)
    ).toEqual(['plan', 'tone', 'coverage', 'check', 'final']);
    expect(
      f.generated
        .filter((body) => body.learningContext.workflow.stage === 'agent')
        .every(
          (body) =>
            Object.keys(body.learningContext).sort().join(',') === 'generalQAOnly,owner,questionEntryContract,workflow'
        )
    ).toBe(true);
  });

  it('read-only recovery never starts missing work; explicit continuation reuses completed tasks', async () => {
    const f = runnerFixture();
    await f.run();
    f.saved.delete(workflowRequestId(identity.requestId, 'coverage'));
    f.saved.delete(workflowRequestId(identity.requestId));
    f.generate.mockClear();
    expect(await f.run({ workflowMode: 'read' })).toMatchObject({
      workflowCanContinue: true,
      status: 'workflow_incomplete'
    });
    expect(f.generate).not.toHaveBeenCalled();
    expect(await f.run({ workflowMode: 'continue' })).toMatchObject({
      success: true,
      data: { workflowReceipt: { reusedTasks: 2 } }
    });
    expect(f.generate.mock.calls.map(([body]) => body.requestId)).toEqual([
      workflowRequestId(identity.requestId, 'coverage'),
      workflowRequestId(identity.requestId)
    ]);
  });

  it('reconstructs a completed run by reads alone and preserves every original request identifier', async () => {
    const f = runnerFixture();
    const original = await f.run();
    f.generate.mockClear();
    const restored = await f.run({ workflowMode: 'read' });
    expect(restored.data.workflowReceipt.taskRequestIds).toEqual(original.data.workflowReceipt.taskRequestIds);
    expect(restored.data.workflowReceipt.reusedTasks).toBe(3);
    expect(f.generate).not.toHaveBeenCalled();
  });

  it('does not replay a failed child or launch dependents and synthesis', async () => {
    const f = runnerFixture();
    await f.run();
    f.saved.set(workflowRequestId(identity.requestId, 'tone'), { success: false, code: 503, status: 'failed' });
    f.generate.mockClear();
    expect(await f.run({ workflowMode: 'continue' })).toMatchObject({ success: false, status: 'failed' });
    expect(f.generate).not.toHaveBeenCalled();
  });

  it('stops after an account or authorization change before starting any child', async () => {
    const f = runnerFixture();
    let current = true;
    const normal = f.generate.getMockImplementation();
    f.generate.mockImplementation(async (body) => {
      const result = await normal(body);
      current = false;
      return result;
    });
    await expect(
      f.run({
        assertCurrent: () => {
          if (!current) throw Object.assign(new Error('changed'), { code: 'CONTEXT_CHANGED' });
        }
      })
    ).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    expect(f.generate).toHaveBeenCalledTimes(1);
  });

  it('requires explicit sharing before continuation and rejects mismatched child receipts', async () => {
    const f = runnerFixture();
    await f.run();
    f.saved.delete(workflowRequestId(identity.requestId, 'coverage'));
    f.payload.shareConsent = false;
    f.generate.mockClear();
    await expect(f.run({ workflowMode: 'continue' })).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    expect(f.generate).not.toHaveBeenCalled();
    f.payload.shareConsent = true;
    f.saved.get(workflowRequestId(identity.requestId, 'tone')).data.workflowReceipt.planDigest = 'wrong';
    await expect(f.run({ workflowMode: 'read' })).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
  });
});
