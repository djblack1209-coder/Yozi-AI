import { observeLearningDialogs } from '../setup.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createLearningRepository, LEARNING_KEY } from '@/services/learning/learning-repository.js';
import {
  emptyLearningState,
  applyLearningOperation,
  normalizePrivateSyncOperation,
  summarizeLearning
} from '@/services/learning/learning-domain.js';
import { prepareLearningRestore } from '@/services/learning/learning-backup.js';
import { synchronizeLearning } from '@/services/learning/learning-sync.js';
import { parsePastedMaterial } from '@/services/learning/material-intake.js';
import { deleteConnectedMaterial } from '@/services/learning/material-connector.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { learningRepository } from '@/services/learning/learning-repository.js';
import { mount, flushPromises } from '@vue/test-utils';
import LearningPage from '@/pages/learning/index.vue';
import LearningOverview from '@/components/business/learning/learning-overview.vue';
vi.mock('@dcloudio/uni-app', () => ({ onShow: vi.fn(), onHide: vi.fn(), onLoad: vi.fn(), onBackPress: vi.fn() }));

const marker = 'TEST_ONLY_PRIVATE_CONTENT_删后不可恢复';
const fileId = 'a'.repeat(64);
const origin = 'http://127.0.0.1:8765';
const connection = {
  endpoint: `${origin}/parse`,
  allowedOrigins: [origin],
  consent: true,
  token: 'TEST_ONLY_MATERIAL_DELETE_TOKEN_32_chars'
};
const at = Date.now() - 10000;
function fixture() {
  let state = emptyLearningState('u1', 'Asia/Shanghai');
  const put = (id, type, data) => {
    state = applyLearningOperation(state, { id, type, data, at }).state;
  };
  put('material-event', 'material.add', { material: parsePastedMaterial(marker, 'm1') });
  put('private-convo', 'conversation.start', { goal: marker });
  put('private-question', 'question.add', {
    question: {
      id: 'private',
      version: 1,
      prompt: marker,
      source: { materialId: 'm1' },
      scope: 'private',
      answerType: 'subjective'
    }
  });
  put('private-focus', 'question.focus', { conversationId: 'private-convo', questionKey: 'private@1' });
  put('private-message', 'message.add', { conversationId: 'private-convo', role: 'user', content: marker });
  put('independent-convo', 'conversation.start', { goal: '不依赖私人资料的独立加法检验' });
  for (let i = 0; i < 6; i++)
    put(`q${i}`, 'question.add', {
      question: {
        id: `q${i}`,
        version: 1,
        prompt: `计算 ${i} + 10。`,
        scope: 'generated',
        answerType: 'number',
        source: { kind: 'executable' },
        validation: {
          type: 'number',
          answer: String(i + 10),
          authority: 'executable',
          evidenceId: 'integer-arithmetic-v1'
        }
      }
    });
  put('plan', 'plan.set', {
    tasks: Array.from({ length: 10 }, (_, i) => ({
      id: `task${i}`,
      title: i === 6 ? marker : '完成明确任务',
      questionKey: i < 6 ? `q${i}@1` : i === 6 ? 'private@1' : null,
      condition: i < 7 ? 'submitted' : 'manual'
    }))
  });
  put('private-attempt', 'attempt.submit', { conversationId: 'private-convo', answer: marker, explicit: true });
  for (let i = 0; i < 6; i++) {
    put(`focus${i}`, 'question.focus', { conversationId: 'independent-convo', questionKey: `q${i}@1` });
    put(`answer${i}`, 'attempt.submit', {
      conversationId: 'independent-convo',
      answer: i < 2 ? '999' : String(i + 10)
    });
  }
  return state;
}
function repository(initial = fixture()) {
  const records = new Map([[LEARNING_KEY, structuredClone(initial)]]);
  const storage = {
    get: (key, fallback) => (records.has(key) ? structuredClone(records.get(key)) : fallback),
    save: (key, value) => {
      records.set(key, structuredClone(value));
      return true;
    },
    remove: (key) => {
      records.delete(key);
      return true;
    }
  };
  return { repo: createLearningRepository(storage, () => 'u1'), records, storage };
}
beforeEach(() => {
  uni.clearStorageSync();
  setActivePinia(createPinia());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('资料隐私删除与连续学习事实', () => {
  it('保存阅读位置、笔记和高亮，并随对应资料清除私有文本', () => {
    const { repo } = repository();
    const segment = repo.read().materials[0].segments[0];
    const location = { materialId: 'm1', segmentId: segment.id, version: segment.extractionEventId };
    const note = '只存在于阅读笔记中的测试文字';
    repo.commit({ id: 'reading-position', type: 'material.reading', data: { ...location, action: 'position' } });
    repo.commit({
      id: 'reading-note',
      type: 'material.reading',
      data: { ...location, action: 'annotate', start: 0, end: 8, note, marked: true }
    });
    expect(repo.read().materials[0].reading).toEqual({
      position: { segmentId: segment.id, version: segment.extractionEventId },
      annotations: [{ segmentId: segment.id, version: segment.extractionEventId, start: 0, end: 8, note, marked: true }]
    });
    repo.deleteMaterial(repo.previewMaterialDeletion('m1'), true, 'delete-reading');
    expect(JSON.stringify(repo.read())).not.toContain(note);
  });
  it('删除原文、提取、题目、对话及作答事件，保留独立 2/6 首答与 6/10 计划，不可撤回恢复', () => {
    const { repo, records } = repository();
    for (const suffix of ['_recovery', '_migration_backup', '_sync_conflict'])
      records.set(`${LEARNING_KEY}${suffix}`, fixture());
    const preview = repo.previewMaterialDeletion('m1');
    expect(preview).toMatchObject({ questions: 1, attempts: 1, conversations: 1, messages: 1, tasks: 1 });
    repo.deleteMaterial(preview, true, 'delete-m1');
    expect(JSON.stringify([...records.values()])).not.toContain(marker);
    expect(repo.read().attempts).toHaveLength(6);
    expect(summarizeLearning(repo.read())).toMatchObject({
      first: { numerator: 2, denominator: 6 },
      tasks: { numerator: 6, denominator: 10, rate: 0.6 }
    });
    expect(repo.read().plans[0].tasks[6]).toMatchObject({ privacyRemoved: true, completedBy: null });
    expect(() => repo.rollback()).toThrow('没有当前用户');
    expect(() =>
      repo.commit({ id: 'material-event', type: 'material.add', data: { material: parsePastedMaterial(marker, 'm1') } })
    ).toThrow('旧请求');
    expect(() => repo.previewRestore(JSON.stringify(fixture()))).toThrow('已删除资料');
  });
  it('删除导出可从空状态重放；重复恢复不增加计数，旧快照替换不能复活材料', () => {
    const { repo } = repository();
    repo.deleteMaterial(repo.previewMaterialDeletion('m1'), true, 'delete-m1');
    const restored = prepareLearningRestore(emptyLearningState('u1'), repo.exportData()).state;
    expect(JSON.stringify(restored)).not.toContain(marker);
    expect(summarizeLearning(restored).tasks).toMatchObject({ numerator: 6, denominator: 10 });
    expect(prepareLearningRestore(restored, repo.exportData()).imported).toBe(0);
    repo.replaceSynchronized(fixture());
    expect(repo.exportData()).not.toContain(marker);
  });
  it('陈旧或跨账户删除预览被拒绝；派生变式和全部题目版本一并删除', () => {
    const { repo } = repository();
    const old = repo.previewMaterialDeletion('m1');
    repo.commit({
      id: 'variant',
      type: 'question.add',
      data: {
        question: {
          id: 'variant',
          version: 1,
          prompt: marker,
          parentQuestionKey: 'private@1',
          source: { kind: 'generated' },
          scope: 'generated'
        }
      }
    });
    expect(() => repo.deleteMaterial(old, true, 'delete-m1')).toThrow('重新预览');
    const preview = repo.previewMaterialDeletion('m1');
    expect(preview.questions).toBe(2);
    expect(() => repo.deleteMaterial({ ...preview, owner: 'other' }, true, 'delete-m1')).toThrow('账户');
    repo.deleteMaterial(preview, true, 'delete-m1');
    expect(repo.read().materialDeletions[0].questionKeys).toEqual(['private@1', 'variant@1']);
  });
  it('隐私删除保存中断保持无正文日志，重开自动完成；不把未保存的删除报成功', () => {
    const { repo, storage, records } = repository();
    const save = storage.save;
    storage.save = (key, value) => (key === LEARNING_KEY ? false : save(key, value));
    expect(() => repo.deleteMaterial(repo.previewMaterialDeletion('m1'), true, 'delete-m1')).toThrow('未保存');
    expect(JSON.stringify(records.get(`${LEARNING_KEY}_privacy_pending`))).not.toContain(marker);
    expect(() => repo.read()).toThrow('未保存');
    storage.save = save;
    expect(repo.read().materials).toHaveLength(0);
    expect(records.has(`${LEARNING_KEY}_privacy_pending`)).toBe(false);
    expect(repo.exportData()).not.toContain(marker);
  });
  it('同步先发墓碑，不上传已删正文；已同步原文、离线新设备和重复同步均不能复活资料', async () => {
    const { repo } = repository();
    let remote = fixture().events.reduce(
      (s, event) => applyLearningOperation(s, normalizePrivateSyncOperation(event)).state,
      emptyLearningState('u1', 'Asia/Shanghai')
    );
    repo.deleteMaterial(repo.previewMaterialDeletion('m1'), true, 'delete-m1');
    const sent = [];
    const request = async (_path, body) => {
      if (body.action === 'push') {
        sent.push(body.operations);
        for (const op of body.operations)
          remote = applyLearningOperation(remote, normalizePrivateSyncOperation(op)).state;
      }
      return { success: true, data: { state: structuredClone(remote) } };
    };
    await synchronizeLearning(repo, true, request);
    expect(sent[0][0].type).toBe('material.delete');
    expect(JSON.stringify(sent)).not.toContain(marker);
    const oldDevice = repository();
    await synchronizeLearning(oldDevice.repo, true, request);
    expect(oldDevice.repo.exportData()).not.toContain(marker);
    await synchronizeLearning(repo, true, request);
    expect(summarizeLearning(remote).first).toMatchObject({ numerator: 2, denominator: 6 });
  });
  it('首次同步空云端也能重放删除后的骨架和任务，不依赖已删正文', async () => {
    const { repo } = repository();
    let remote = emptyLearningState('u1');
    repo.deleteMaterial(repo.previewMaterialDeletion('m1'), true, 'delete-m1');
    await synchronizeLearning(repo, true, async (_path, body) => {
      for (const op of body.operations || [])
        remote = applyLearningOperation(remote, normalizePrivateSyncOperation(op)).state;
      return { success: true, data: { state: structuredClone(remote) } };
    });
    expect(summarizeLearning(remote).tasks).toMatchObject({ numerator: 6, denominator: 10 });
    expect(JSON.stringify(remote)).not.toContain(marker);
  });
  it('两台设备分别删除同一资料可幂等合并，不因删除标识不同产生正文冲突', async () => {
    const one = repository(),
      two = repository();
    one.repo.deleteMaterial(one.repo.previewMaterialDeletion('m1'), true, 'delete-one');
    two.repo.deleteMaterial(two.repo.previewMaterialDeletion('m1'), true, 'delete-two');
    let remote = emptyLearningState('u1');
    const request = async (_path, body) => {
      for (const op of body.operations || [])
        remote = applyLearningOperation(remote, normalizePrivateSyncOperation(op)).state;
      return { success: true, data: { state: structuredClone(remote) } };
    };
    await synchronizeLearning(one.repo, true, request);
    await synchronizeLearning(two.repo, true, request);
    await synchronizeLearning(one.repo, true, request);
    expect(one.repo.exportData()).not.toContain(marker);
    expect(one.repo.read().attempts).toHaveLength(6);
    expect(prepareLearningRestore(emptyLearningState('u1'), one.repo.exportData()).state.materials).toHaveLength(0);
  });
  it('连续删除两份资料会再次清理已脱敏计划的剩余关联，不在骨架里残留正文', () => {
    const { repo } = repository();
    repo.commit({
      id: 'material-two',
      type: 'material.add',
      data: { material: parsePastedMaterial('TEST_ONLY_SECOND_SECRET', 'm2') }
    });
    repo.commit({
      id: 'question-two',
      type: 'question.add',
      data: {
        question: {
          id: 'second',
          version: 1,
          prompt: 'TEST_ONLY_SECOND_SECRET',
          scope: 'private',
          source: { materialId: 'm2' }
        }
      }
    });
    repo.commit({
      id: 'plan-two',
      type: 'plan.set',
      data: {
        tasks: [
          { id: 'a', title: marker, questionKey: 'private@1', condition: 'manual' },
          { id: 'b', title: 'TEST_ONLY_SECOND_SECRET', questionKey: 'second@1', condition: 'manual' }
        ]
      }
    });
    repo.commit({ id: 'manual-done', type: 'task.complete', data: { planId: 'plan-two', taskId: 'a' } });
    repo.deleteMaterial(repo.previewMaterialDeletion('m1'), true, 'delete-m1');
    repo.deleteMaterial(repo.previewMaterialDeletion('m2'), true, 'delete-m2');
    expect(repo.exportData()).not.toContain('TEST_ONLY_SECOND_SECRET');
    const restored = prepareLearningRestore(emptyLearningState('u1'), repo.exportData()).state;
    expect(restored.plans.at(-1).tasks).toHaveLength(2);
    expect(restored.plans.at(-1).tasks.every((t) => t.privacyRemoved && !t.completedBy)).toBe(true);
  });
  it('备份的墓碑不能在普通恢复中悄悄删除当前资料', () => {
    const deleted = repository();
    deleted.repo.deleteMaterial(deleted.repo.previewMaterialDeletion('m1'), true, 'delete-m1');
    const current = repository();
    expect(() => current.repo.previewRestore(deleted.repo.exportData())).toThrow('独立预览');
    expect(current.repo.read().materials).toHaveLength(1);
  });
  it('旧重复资料的别名题源仍可清理；旧快照未存 aliases 也从真实导入事件重建关联', () => {
    const { repo, records } = repository();
    repo.commit({
      id: 'legacy-duplicate',
      type: 'material.add',
      data: { material: parsePastedMaterial(marker, 'alias-m1') }
    });
    repo.commit({
      id: 'alias-question',
      type: 'question.add',
      data: {
        question: { id: 'alias-q', version: 1, prompt: marker, scope: 'private', source: { materialId: 'alias-m1' } }
      }
    });
    const legacy = repo.read();
    delete legacy.materials[0].aliases;
    records.set(LEARNING_KEY, legacy);
    const preview = repo.previewMaterialDeletion('m1');
    expect(preview.materialIds).toEqual(['alias-m1', 'm1']);
    expect(preview.questions).toBe(2);
    repo.deleteMaterial(preview, true, 'delete-m1');
    expect(repo.exportData()).not.toContain(marker);
    expect(() =>
      repo.commit({
        id: 'late-alias',
        type: 'material.add',
        data: { material: parsePastedMaterial(marker, 'alias-m1') }
      })
    ).toThrow('资料已删除');
  });
});

describe('原件删除回执和真实状态', () => {
  it('删除任务显示不再执行，保留计划分母而不提供无效完成入口', async () => {
    learningRepository.replaceSynchronized({ ...fixture(), owner: 'guest' });
    const store = useConversationLearningStore();
    await store.deleteMaterial(store.previewMaterialDeletion('m1'), true);
    const wrapper = mount(LearningOverview, {
      props: { view: 'plan', initialExpanded: true },
      global: {
        stubs: {
          view: { template: '<div><slot /></div>' },
          text: { template: '<span><slot /></span>' },
          BaseIcon: true
        }
      }
    });
    try {
      const removed = wrapper.findAll('.task-row').find((row) => row.text().includes('关联资料或作答已删除'));
      expect(removed.text()).toContain('已移除');
      expect(removed.findAll('button')).toHaveLength(0);
      expect(wrapper.findAll('button').filter((b) => b.text().trim() === '记录完成')).toHaveLength(3);
      expect(store.summary.tasks).toMatchObject({ numerator: 6, denominator: 10 });
    } finally {
      wrapper.unmount();
      store.$dispose();
    }
  });
  it('原件待办仅阻塞同一目标的同一文件，其他资料继续导入和学习', async () => {
    const store = useConversationLearningStore();
    const material = parsePastedMaterial(marker, 'm1');
    material.original = { connectorFileId: fileId, connectorOrigin: origin };
    store.commit('material.add', { material });
    store.materialConnection = connection;
    const transport = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('TEST_ONLY_OFFLINE'));
    await store.deleteMaterial(store.previewMaterialDeletion('m1'), true);
    const another = 'b'.repeat(64);
    transport.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          data: {
            id: another,
            fingerprint: another,
            name: 'OTHER_TEST_ONLY.pdf',
            scope: 'private',
            original: { connectorFileId: another },
            segments: [{ id: 'p1', content: '另一份资料' }],
            totalPages: 1,
            nextPage: null
          }
        })
    });
    await store.importFile({ size: 10, contentBase64: 'TEST_ONLY' });
    expect(store.state.materials).toHaveLength(1);
    expect(store.state.materialDeletions[0].originalStatus).toBe('pending');
    store.$dispose();
  });
  it('实际页面预览可取消；确认才清除资料、编辑缓存并更新同一套统计', async () => {
    learningRepository.replaceSynchronized({ ...fixture(), owner: 'guest' });
    const store = useConversationLearningStore();
    const wrapper = mount(LearningPage, {
      global: {
        stubs: {
          view: { template: '<div><slot /></div>' },
          text: { template: '<span><slot /></span>' },
          LearningShell: { template: '<div><slot /><slot name="composer" /></div>' },
          LearningOverview: true,
          NumberLine: true
        }
      }
    });
    const button = (label) => wrapper.findAll('button').find((b) => b.text().trim() === label);
    let modal;
    observeLearningDialogs(wrapper, (o) => {
      modal = o;
    });
    try {
      await wrapper.get('#learning-composer [aria-label="导入资料"]').trigger('tap');
      await button('粘贴文字').trigger('tap');
      await button('用此资料练习').trigger('tap');
      await button('预览并删除资料').trigger('tap');
      expect(modal.content).toContain('1 次');
      expect(modal.content).toContain('计划保留任务分母');
      modal.success({ confirm: false });
      await flushPromises();
      expect(store.state.materials).toHaveLength(1);
      await button('预览并删除资料').trigger('tap');
      modal.success({ confirm: true });
      await flushPromises();
      expect(store.state.materials).toHaveLength(0);
      expect(store.summary).toMatchObject({
        first: { numerator: 2, denominator: 6 },
        tasks: { numerator: 6, denominator: 10 }
      });
      expect(wrapper.find('textarea[aria-label="题干校对"]').exists()).toBe(false);
      expect(wrapper.text()).toContain('本机关联记录已清理');
    } finally {
      wrapper.unmount();
      store.$dispose();
    }
  });
  it('目标、权限、平台或取消不匹配时不发送；假成功和未匹配文件回执不能确认删除', async () => {
    const transport = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, text: async () => JSON.stringify({ success: true, data: { deleted: true } }) });
    const original = { fileId, connectorOrigin: origin };
    await expect(
      deleteConnectedMaterial(connection, { ...original, connectorOrigin: 'http://127.0.0.1:9999' }, { platform: 'h5' })
    ).rejects.toThrow('不是导入');
    await expect(deleteConnectedMaterial(connection, original, { platform: 'mp-weixin' })).rejects.toThrow('当前端');
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      deleteConnectedMaterial(connection, original, { platform: 'h5', signal: cancelled.signal })
    ).rejects.toThrow('取消');
    expect(transport).not.toHaveBeenCalled();
    await expect(deleteConnectedMaterial(connection, original, { platform: 'h5' })).rejects.toThrow('有效回执');
    expect(transport.mock.calls[0][1]).toMatchObject({ redirect: 'error', body: JSON.stringify({ fileId }) });
  });
  it('本机清理后原件失败形成待办，刷新可重试，成功与重复点击都不再扣额度或增作答', async () => {
    const store = useConversationLearningStore();
    const material = parsePastedMaterial(marker, 'm1');
    material.original = { connectorFileId: fileId, connectorOrigin: origin };
    store.commit('material.add', { material });
    store.materialConnection = connection;
    const transport = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('TEST_ONLY_OFFLINE'));
    const result = await store.deleteMaterial(store.previewMaterialDeletion('m1'), true);
    expect(result.original.status).toBe('pending');
    expect(store.state.materials).toHaveLength(0);
    const deletion = store.state.materialDeletions[0];
    expect(store.exportData()).not.toContain(marker);
    expect(store.exportData()).not.toContain(connection.token);
    transport.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          data: {
            id: fileId,
            fingerprint: fileId,
            name: 'TEST_ONLY.pdf',
            scope: 'private',
            original: { connectorFileId: fileId },
            segments: [{ id: 'p1', content: 'TEST_ONLY' }],
            totalPages: 1,
            nextPage: null
          }
        })
    });
    await expect(store.importFile({ size: 1, contentBase64: 'TEST_ONLY' })).rejects.toThrow('先完成这份');
    transport.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true, data: { deleted: true, fileId } })
    });
    await store.retryOriginalDeletion(deletion.deletionId, true);
    expect(store.state.materialDeletions[0].originalStatus).toBe('deleted');
    await store.retryOriginalDeletion(deletion.deletionId, true);
    expect(transport).toHaveBeenCalledTimes(3);
    expect(store.state.attempts).toHaveLength(0);
    store.$dispose();
  });
  it('同一原件在两个授权解析器上保留不同资料标识，不把删除发到另一台解析器', async () => {
    const store = useConversationLearningStore();
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          data: {
            id: fileId,
            fingerprint: fileId,
            kind: 'pdf',
            scope: 'private',
            name: 'TEST_ONLY.pdf',
            segments: [{ id: 'p1', content: 'TEST_ONLY' }],
            totalPages: 1,
            original: { connectorFileId: fileId },
            status: 'ready',
            nextPage: null
          }
        })
    });
    store.materialConnection = connection;
    await store.importFile({ size: 10, contentBase64: 'TEST_ONLY' });
    const firstId = store.state.materials[0].id;
    const second = 'http://127.0.0.1:8766';
    store.materialConnection = { ...connection, endpoint: `${second}/parse`, allowedOrigins: [second] };
    await store.importFile({ size: 10, contentBase64: 'TEST_ONLY' });
    expect(store.state.materials).toHaveLength(2);
    expect(new Set(store.state.materials.map((m) => m.id)).size).toBe(2);
    const result = await store.deleteMaterial(store.previewMaterialDeletion(firstId), true);
    expect(result.original.status).toBe('pending');
    expect(transport).toHaveBeenCalledTimes(2);
    expect(store.state.materials[0].original.connectorOrigin).toBe(second);
    store.$dispose();
  });
  it('恢复备份中的原件回执只保留历史，重新确认后可保存新的成功回执', async () => {
    const store = useConversationLearningStore();
    const material = parsePastedMaterial(marker, 'm1');
    material.original = { connectorFileId: fileId, connectorOrigin: origin };
    store.commit('material.add', { material });
    store.materialConnection = connection;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true, data: { deleted: true, fileId } })
    });
    await store.deleteMaterial(store.previewMaterialDeletion('m1'), true);
    const data = store.exportData();
    const restored = prepareLearningRestore(emptyLearningState('guest'), data).state;
    expect(restored.materialDeletions[0].originalStatus).toBe('pending');
    uni.clearStorageSync();
    store.$dispose();
    setActivePinia(createPinia());
    const other = useConversationLearningStore();
    other.restoreData(data, other.previewRestore(data));
    other.materialConnection = connection;
    await other.retryOriginalDeletion(other.state.materialDeletions[0].deletionId, true);
    expect(other.state.materialDeletions[0].originalStatus).toBe('deleted');
    other.$dispose();
  });
});
