import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { normalizeContentBlocks } from '../../laf-backend/functions/_shared/learning-content-blocks.js';
import { emptyLearningState, applyLearningOperation } from '../../laf-backend/functions/_shared/learning-domain.js';
import { parseLearningOutput } from '../../laf-backend/functions/_shared/ai-providers/learning-provider.ts';
import { executeLearningTool } from '@/services/learning/learning-tools.js';
import LearningContentCards from '@/pages/learning/components/learning-content-cards.vue';
import { synchronizeLearning } from '@/services/learning/learning-sync.js';
import { proposalStatus } from '../../laf-backend/functions/_shared/learning-proposals.js';

const cards = {
  version: 1,
  items: [
    { kind: 'knowledge', title: 'Adding', body: 'Combine two groups.', points: ['Count both groups.'] },
    { kind: 'example', title: 'A worked example', steps: ['Start with two.', 'Add three.', 'The total is five.'] }
  ]
};
function repository() {
  let state = emptyLearningState('isolated-cards', 'UTC');
  const repo = {
    read: () => state,
    commit(operation) {
      const result = applyLearningOperation(state, { at: 1000, ...operation });
      state = result.state;
      return result;
    }
  };
  repo.commit({ id: 'conversation', type: 'conversation.start', data: { goal: 'Learn addition' } });
  return repo;
}
function propose(repo, id = 'proposal', type = 'profile.set', data = { field: 'minutes', value: '20' }) {
  repo.commit({
    id,
    type: 'message.add',
    data: {
      conversationId: 'conversation',
      role: 'assistant',
      content: 'Confirm this suggestion.',
      proposal: { type, data }
    }
  });
  return repo.read().conversations[0].messages.at(-1).proposal;
}
function accept(repo, proposal, id = 'proposal') {
  return repo.commit({
    id: `${id}:accept`,
    type: proposal.type,
    data: { ...proposal.data, proposalId: id, explicit: true }
  });
}

describe('bounded teaching cards', () => {
  it('parses model cards, and preserves them through saved event replay', () => {
    const parsed = parseLearningOutput(JSON.stringify({ message: 'Let us learn.', tools: [], contentBlocks: cards }));
    expect(parsed.contentBlocks).toEqual(normalizeContentBlocks(cards));
    const repo = repository();
    repo.commit({
      id: 'reply',
      type: 'message.add',
      data: {
        conversationId: 'conversation',
        role: 'assistant',
        content: parsed.message,
        contentBlocks: parsed.contentBlocks
      }
    });
    let restored = emptyLearningState('isolated-cards', 'UTC');
    for (const event of JSON.parse(JSON.stringify(repo.read().events)))
      restored = applyLearningOperation(restored, event).state;
    expect(restored.conversations[0].messages[0].contentBlocks).toEqual(normalizeContentBlocks(cards));
    expect(restored.attempts).toHaveLength(0);
  });
  it.each([
    { ...cards, version: 4 },
    { version: 2, items: [{ kind: 'checklist', items: [{ id: 'a', label: 'Read' }] }] },
    { version: 1, items: [{ kind: 'knowledge', title: 'Score', body: 'Read', score: 100 }] },
    { version: 1, items: [{ kind: 'knowledge', title: 'Action', body: 'Read', tools: [{ name: 'submit' }] }] },
    { version: 1, items: [{ kind: 'progress', title: 'Progress', body: '100%' }] },
    { version: 1, items: [{ kind: 'note', title: 'Empty' }] },
    { version: 1, items: [{ kind: 'example', title: 'Long', body: 'x'.repeat(2001) }] },
    { version: 1, items: Array(7).fill(cards.items[0]) }
  ])('rejects unsupported or untrusted card payloads before saving', (value) => {
    expect(() => normalizeContentBlocks(value)).toThrow();
    const repo = repository(),
      before = JSON.stringify(repo.read());
    expect(() =>
      repo.commit({
        id: 'bad',
        type: 'message.add',
        data: { conversationId: 'conversation', role: 'assistant', content: 'Read', contentBlocks: value }
      })
    ).toThrow();
    expect(JSON.stringify(repo.read())).toBe(before);
  });
  it('reveals cards and example steps without changing learning facts', async () => {
    const wrapper = mount(LearningContentCards, {
      props: { content: cards },
      global: { stubs: { BaseIcon: true, YoziMascot: true } }
    });
    try {
      expect(wrapper.text()).toContain('Combine two groups.');
      expect(wrapper.text()).not.toContain('A worked example');
      await wrapper.find('button').trigger('tap');
      expect(wrapper.text()).toContain('Start with two.');
      expect(wrapper.text()).not.toContain('Add three.');
      await wrapper.find('button').trigger('tap');
      expect(wrapper.text()).toContain('Add three.');
    } finally {
      wrapper.unmount();
    }
  });
});

describe('explicit proposal adoption', () => {
  it('stores profile drafts and adopts the selected value once', () => {
    const repo = repository(),
      proposal = propose(repo);
    expect(repo.read().profile).toHaveLength(0);
    accept(repo, proposal);
    expect(repo.read().profile[0]).toMatchObject({ field: 'minutes', value: '20', source: 'self_report' });
    expect(accept(repo, proposal).reused).toBe(true);
    expect(repo.read().profile).toHaveLength(1);
    expect(proposalStatus(repo.read(), 'proposal')).toBe('accepted');
  });
  it('refuses changed, dismissed or stale suggestions and preserves newer facts', () => {
    const repo = repository(),
      proposal = propose(repo);
    const before = JSON.stringify(repo.read());
    expect(() => accept(repo, { ...proposal, data: { ...proposal.data, value: '60' } })).toThrow();
    expect(JSON.stringify(repo.read())).toBe(before);
    repo.commit({
      id: 'proposal:dismiss',
      type: 'message.add',
      data: { conversationId: 'conversation', role: 'notice', content: 'Not adopted' }
    });
    expect(() => accept(repo, proposal)).toThrow();
    const next = propose(repo, 'new-proposal');
    repo.commit({
      id: 'new-profile',
      type: 'profile.set',
      data: { field: 'minutes', value: '30', source: 'self_report', scope: '当前任务' }
    });
    expect(() => accept(repo, next, 'new-proposal')).toThrow();
    expect(repo.read().profile.at(-1).value).toBe('30');
  });
  it('does not let the model apply a suggested plan', () => {
    const repo = repository();
    const result = executeLearningTool(
      repo,
      {
        id: 'model-plan',
        name: 'plan',
        arguments: { tasks: [{ title: 'Read and practice', condition: 'manual' }], reason: 'Use a short session.' }
      },
      {
        conversationId: 'conversation',
        permissions: ['learn'],
        calls: 0,
        maxCalls: 3,
        deadline: Date.now() + 1000,
        origin: 'model'
      }
    );
    expect(result.success).toBe(true);
    expect(repo.read().plans).toHaveLength(0);
    const proposal = repo.read().conversations[0].messages[0].proposal;
    accept(repo, proposal, 'model-plan');
    expect(repo.read().plans[0].tasks[0].title).toBe('Read and practice');
  });
  it('cannot confirm a suggestion from a different conversation', () => {
    const repo = repository(),
      proposal = propose(repo);
    repo.commit({ id: 'other', type: 'conversation.start', data: { goal: 'Other goal' } });
    expect(() => accept(repo, { ...proposal, data: { ...proposal.data, conversationId: 'other' } })).toThrow();
    expect(repo.read().profile).toHaveLength(0);
  });
});

it('rejects proposal acceptance after stop or a newer learning goal', () => {
  const repo = repository(),
    proposal = propose(repo);
  repo.commit({ id: 'stop', type: 'task.stop', data: { conversationId: 'conversation' } });
  expect(() => accept(repo, proposal)).toThrow('停止');
  const other = repository(),
    draft = propose(other);
  other.commit({
    id: 'goal-change',
    type: 'profile.set',
    data: { conversationId: 'conversation', field: 'goal', value: 'A new goal', source: 'self_report' }
  });
  expect(() => accept(other, draft)).toThrow('更新');
});

it.each(['contentBlocks', 'proposal'])(
  'retains local %s when an older server keeps events but drops rich messages',
  async (field) => {
    const repo = repository();
    if (field === 'proposal') propose(repo);
    else
      repo.commit({
        id: 'card',
        type: 'message.add',
        data: { conversationId: 'conversation', role: 'assistant', content: 'Read', contentBlocks: cards }
      });
    const before = JSON.stringify(repo.read()),
      remote = structuredClone(repo.read());
    for (const message of remote.conversations[0].messages) delete message[field];
    let replaced = false;
    repo.replaceSynchronized = () => {
      replaced = true;
    };
    await expect(
      synchronizeLearning(repo, true, async () => ({ success: true, data: { state: remote } }))
    ).rejects.toMatchObject({ code: 'SYNC_UPGRADE_REQUIRED' });
    expect(replaced).toBe(false);
    expect(JSON.stringify(repo.read())).toBe(before);
  }
);
it('a proposal marker cannot be used to request a destructive operation', () => {
  const repo = repository(),
    proposal = propose(repo);
  expect(() =>
    repo.commit({
      id: 'forged',
      type: 'material.delete',
      data: { ...proposal.data, proposalId: 'proposal', explicit: true }
    })
  ).toThrow('其他操作');
  expect(repo.read().profile).toEqual([]);
});
