import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createLearningRepository, learningRepository, LEARNING_KEY } from '@/services/learning/learning-repository.js';
import { storageService, StorageService } from '@/services/storageService.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { getLoginSessionEpoch, sessionCredentialProof, captureSession } from '@/services/auth-storage.js';
import { obfuscate, deobfuscate } from '@/utils/crypto/cipher.js';
import { parsePastedMaterial } from '@/services/learning/material-intake.js';
function requestFor(pending, action, occurrence = 0) {
  const matches = pending.filter((request) =>
    action.startsWith('/')
      ? request.url.endsWith(action)
      : request.url.endsWith('/learning-models') && request.data.action === action
  );
  if (!matches[occurrence]) throw new Error(`Missing fixture request ${action} #${occurrence}`);
  return matches[occurrence];
}
const epochKey = `${LEARNING_KEY}_lifecycle`;
function pair() {
  const map = new Map();
  const storage = {
    get: (key, fallback) => structuredClone(map.get(key) ?? fallback),
    save: (key, value) => {
      map.set(key, structuredClone(value));
      return true;
    },
    remove: (key) => {
      map.delete(key);
      return true;
    }
  };
  const a = createLearningRepository(storage, () => 'u1');
  const b = createLearningRepository(storage, () => 'u1');
  a.commit({ id: 'original', type: 'conversation.start', data: { goal: '原记录' } });
  const backup = a.exportData();
  a.deleteData();
  a.commit({ id: 'current', type: 'conversation.start', data: { goal: '当前记录' } });
  return { a, b, map, storage, backup };
}
function mutate(repo, kind, backup) {
  if (kind === 'delete') repo.deleteData();
  else if (kind === 'restore') repo.restoreData(backup, repo.read().revision);
  else if (kind === 'rollback') {
    repo.commit({
      id: 'new-profile',
      type: 'profile.set',
      data: { field: 'foundation', value: '普通观察', source: 'self_report', scope: '当前任务' }
    });
    repo.rollback();
  } else if (kind === 'sync') repo.replaceSynchronized(repo.read());
  else if (kind === 'epoch-remove') repo._map.delete(epochKey);
}
describe('跨Repository生命周期撤销', () => {
  it.each(['delete', 'restore', 'rollback', 'sync'])('另一窗口%s使已捕获生命周期失效，重建实例仍能继续', (kind) => {
    const { a, b, map, storage, backup } = pair();
    const before = a.lifecycleRevision();
    mutate(b, kind, backup);
    expect(a.lifecycleRevision()).not.toBe(before);
    expect(map.get(epochKey)).toMatchObject({ owner: 'u1', contract: 'learning-lifecycle-v1' });
    const fresh = createLearningRepository(storage, () => 'u1');
    expect(fresh.read()).toEqual(a.read());
  });
  it('普通学习写入与重复备份恢复不撤销生命周期', () => {
    const { a, b } = pair();
    const before = a.lifecycleRevision();
    b.commit({
      id: 'profile',
      type: 'profile.set',
      data: { field: 'foundation', value: '普通观察', source: 'self_report', scope: '当前任务' }
    });
    b.restoreData(b.exportData(), b.read().revision);
    expect(a.lifecycleRevision()).toBe(before);
  });
  it('同账户清除后恢复原记录仍不同于旧上下文，标记不进入备份', () => {
    const { a, b, backup } = pair();
    const before = a.lifecycleRevision();
    b.deleteData();
    b.restoreData(backup, b.read().revision);
    expect(a.lifecycleRevision()).not.toBe(before);
    expect(a.exportData()).not.toContain('learning-lifecycle-v1');
    expect(a.exportData()).not.toContain('generation');
  });
  it('完整账户清理移除标记也撤销旧动作，首次读取不写元信息', () => {
    const { a, map } = pair();
    const before = a.lifecycleRevision();
    map.delete(epochKey);
    expect(a.lifecycleRevision()).not.toBe(before);
    const empty = pair();
    empty.map.clear();
    empty.a.read();
    expect(empty.map.size).toBe(0);
  });
  it.each(['delete', 'restore', 'rollback', 'sync'])('共享标记保存失败时%s不修改事实或恢复副本', (kind) => {
    const { a, b, storage, map, backup } = pair();
    const before = structuredClone(map);
    const save = storage.save;
    storage.save = (key, value) => (key === epochKey ? false : save(key, value));
    expect(() => mutate(b, kind, backup)).toThrow('撤销标记');
    // rollback's ordinary profile write intentionally preceded the failed restore.
    if (kind !== 'rollback') expect(map).toEqual(before);
    else expect(a.read().events.some((event) => event.id === 'new-profile')).toBe(true);
  });
  it.each([
    { owner: 'other', contract: 'learning-lifecycle-v1', generation: '12345678' },
    { owner: 'u1', contract: 'wrong', generation: '12345678' },
    { owner: 'u1', contract: 'learning-lifecycle-v1', generation: '' }
  ])('损坏/跨账户标记拒绝动作，不覆盖原记录', (value) => {
    const { a, map } = pair();
    const before = a.exportData();
    map.set(epochKey, value);
    expect(() => a.lifecycleRevision()).toThrow();
    expect(() => a.deleteData()).toThrow();
    map.delete(epochKey);
    expect(a.exportData()).toBe(before);
  });
  it('资料动作前检查真实租约；只读仍可读取/导出，零元信息写入', () => {
    const { storage, map } = pair();
    let denied = true;
    const lease = {
      prepare: () => (denied ? 'blocked' : 'writable'),
      assertWritable: () => {
        if (denied) throw Object.assign(new Error('另一窗口'), { code: 'OTHER_WINDOW_ACTIVE' });
      }
    };
    const repo = createLearningRepository(storage, () => 'u1', lease),
      before = structuredClone(map);
    expect(repo.read().owner).toBe('u1');
    expect(repo.exportData()).toBeTruthy();
    expect(() => repo.prepareAsyncAction()).toThrow('另一窗口');
    expect(map).toEqual(before);
    denied = false;
    expect(() => repo.prepareAsyncAction()).not.toThrow();
  });
});
let store, peer, backup;
beforeEach(() => {
  uni.clearStorageSync();
  uni.setStorageSync('EXAM_USER_ID', 'synthetic-crosswindow-owner');
  setActivePinia(createPinia());
  store = useConversationLearningStore();
  store.start('原记录');
  backup = store.exportData();
  store.deleteData();
  store.start('当前记录');
  store.materialConnection = {
    endpoint: 'http://127.0.0.1:8765/parse',
    allowedOrigins: ['http://127.0.0.1:8765'],
    token: 'TEST_ONLY_CROSSWINDOW_MATERIAL_TOKEN_32',
    consent: true
  };
  peer = createLearningRepository(storageService, () => 'synthetic-crosswindow-owner', null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  store?.$dispose();
  vi.restoreAllMocks();
});
function notify() {
  window.dispatchEvent(new StorageEvent('storage', { key: `u_synthetic-crosswindow-owner_${epochKey}` }));
}
describe('模型列表与用量读取的实际请求生命周期', () => {
  it('开发冷启动首次带练等待写入权后只发送一次请求', async () => {
    vi.stubGlobal('__YOZI_DEV_TEST__', true);
    vi.resetModules();
    const { useConversationLearningStore: useFreshStore } = await import('@/stores/modules/conversation-learning.js');
    const { createLearningWriteLease, learningWriteLease } =
      await import('@/services/learning/learning-write-lease.js');
    storageService.saveLoginSession({
      userId: 'synthetic-crosswindow-owner',
      token: 'fixture-only-token',
      userInfo: {}
    });
    setActivePinia(createPinia());
    const fresh = useFreshStore();
    fresh.startCoach('考研英语二写作');
    fresh.coachSave('profile', { profile: { exam: 'english2', deadline: null, minutes: 15 } });
    fresh.sharingAllowed = true;
    fresh.modelId = 'saved-model';
    let release;
    const ready = new Promise((resolve) => {
      release = resolve;
    });
    const lease = createLearningWriteLease({
      request: async (_name, _options, callback) => {
        await ready;
        return callback({});
      }
    });
    vi.spyOn(learningWriteLease, 'assertWritable').mockImplementation((owner) => lease.assertWritable(owner));
    vi.spyOn(learningWriteLease, 'waitUntilWritable').mockImplementation((owner) => lease.waitUntilWritable(owner));
    const sent = [];
    vi.spyOn(uni, 'request').mockImplementation((options) => {
      sent.push(options.url);
      options.success({
        data: options.url.includes('/learning-models')
          ? modelResult('saved-model')
          : { success: false, code: 503, message: '合成供应商暂不可用' }
      });
      return { abort() {} };
    });
    try {
      const pending = fresh.requestCoach('diagnostic').catch((error) => ({ code: error.code }));
      await Promise.resolve();
      release();
      const result = await pending;
      expect(result.code).not.toBe('WRITE_LEASE_PENDING');
      expect(sent.filter((url) => url.endsWith('/proxy-ai'))).toHaveLength(1);
      expect(fresh.active.coach.requests).toHaveLength(1);
    } finally {
      lease.release();
      fresh.$dispose();
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
  function requests() {
    storageService.saveLoginSession({
      userId: 'synthetic-crosswindow-owner',
      token: 'fixture-only-token',
      userInfo: {}
    });
    const pending = [];
    vi.spyOn(uni, 'request').mockImplementation((options) => {
      const abort = vi.fn();
      if (options.url.endsWith('/learning-models') && options.data.action === 'preferences') {
        options.success({ data: { success: true, data: { preferences: options.data.preferences } } });
      } else pending.push({ ...options, abort });
      return { abort };
    });
    return pending;
  }
  const modelResult = (id = 'current-model') => ({
    success: true,
    data: { models: [{ id, provider: '合成供应商', model: id, capabilities: { structured: true } }], presets: [] }
  });
  const usageResult = {
    success: true,
    data: {
      entitlement: {
        week: '2026-10-04',
        timezone: 'Asia/Shanghai',
        policyVersion: 'fixture',
        weeklyUnits: 10,
        spent: 0,
        reserved: 0
      },
      cost: { spent: 0, reserved: 0, pending: 0 }
    }
  };
  const deepSeekPro = {
    source: 'byok',
    model: 'deepseek-v4-pro',
    endpoint: 'https://api.deepseek.com/chat/completions'
  };
  it.each([
    [{ coach: { phase: 'feedback', target: 'diagnostic', feedbackVersion: 2 } }, 125000],
    [{ coach: { phase: 'feedback', target: 'card-c1', feedbackVersion: 2 } }, 70000],
    [{ coach: { phase: 'diagnostic', target: 'diagnostic' } }, 70000],
    [{ coach: { phase: 'diagnostic', target: 'diagnostic' } }, 115000, deepSeekPro],
    [{ coach: { phase: 'essay', target: 'essay' } }, 70000, { ...deepSeekPro, endpoint: 'https://example.test/v1' }],
    [{ intake: { turns: [] } }, 95000, deepSeekPro],
    [{ intake: { turns: [] } }, 65000, { ...deepSeekPro, model: 'deepseek-flash' }]
  ])('实际请求等待与当前学习阶段及模型一致：%j', async (learningContext, timeout, model) => {
    const pending = requests();
    const { learningRequest } = await import('@/services/api/domains/learning.api.js');
    const reading = learningRequest(
      '/proxy-ai',
      { learningContext },
      { session: captureSession(), expectedOwner: 'synthetic-crosswindow-owner', model }
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].timeout).toBe(timeout);
    pending[0].success({ data: { success: true } });
    expect((await reading).success).toBe(true);
  });
  it('连续点击仅一次列表请求；等待不改配置，目录缺项清除失效选择且不改学习事实', async () => {
    const pending = requests(),
      before = store.exportData();
    store.selectedMode = 'local';
    store.modelId = 'explicit-choice';
    store.sharingAllowed = true;
    const first = store.loadModels(),
      second = store.loadModels();
    expect(store.modelListState).toMatchObject({ phase: 'loading' });
    expect(pending).toHaveLength(1);
    expect(requestFor(pending, 'list').data).toEqual({ action: 'list' });
    expect(store.selectedMode).toBe('local');
    expect(store.modelId).toBe('explicit-choice');
    requestFor(pending, 'list').success({ data: modelResult() });
    await Promise.all([first, second]);
    expect(store.modelListState).toMatchObject({ phase: 'ready' });
    expect(store.models[0].id).toBe('current-model');
    expect(store.selectedMode).toBe('offline');
    expect(store.modelId).toBe('');
    expect(store.sharingAllowed).toBe(true);
    expect(store.exportData()).toBe(before);
  });
  it('首次读取恢复已验证模型的显示，不发起推理或授予共享许可', async () => {
    const pending = requests(),
      before = store.exportData();
    const reading = store.loadModels();
    const result = modelResult('saved-model');
    Object.assign(result.data.models[0], { source: 'byok', configured: true, connectionStatus: 'connected' });
    result.data.preferences = { selectedModelId: 'saved-model', sharingAllowed: false };
    requestFor(pending, 'list').success({ data: result });
    await reading;
    expect(store.modelId).toBe('saved-model');
    expect(store.selectedMode).toBe('cloud');
    expect(store.sharingAllowed).toBe(false);
    expect(pending).toHaveLength(1);
    expect(requestFor(pending, 'list').data).toEqual({ action: 'list' });
    expect(store.exportData()).toBe(before);
  });
  it('读取失败与明确重试分别显示状态；成功后清除旧错误，不自动重放', async () => {
    const pending = requests(),
      first = store.loadModels();
    pending[0].fail({ errMsg: 'fixture failure' });
    expect((await first).success).toBe(false);
    expect(store.modelListState).toMatchObject({ phase: 'error', message: '服务连接不可用，学习记录已保存。' });
    expect(pending).toHaveLength(1);
    const retry = store.loadModels();
    pending[1].success({ data: modelResult() });
    await retry;
    expect(store.modelListState).toMatchObject({ phase: 'ready' });
    expect(store.error).toBe('');
  });
  it.each(['models', 'usage'])('%s空回执具有明确空状态', async (kind) => {
    const pending = requests(),
      promise = kind === 'models' ? store.loadModels() : store.loadUsage();
    pending[0].success({ data: { success: true, data: kind === 'models' ? { models: [], presets: [] } : null } });
    await promise;
    expect(kind === 'models' ? store.modelListState : store.modelUsageState).toMatchObject({ phase: 'empty' });
    expect(store.usage).toBeNull();
  });
  it.each([{ models: [{ id: 'broken' }] }, { models: null }, { models: [], presets: [{}] }])(
    '结构不完整的成功列表回执不会进入页面渲染：%j',
    async (data) => {
      const pending = requests(),
        promise = store.loadModels();
      pending[0].success({ data: { success: true, data } });
      expect(await promise).toMatchObject({ success: false, code: 502 });
      expect(store.models).toEqual([]);
      expect(store.modelPresets).toEqual([]);
      expect(store.modelListState.phase).toBe('error');
    }
  );
  it('不完整用量回执不出现NaN或解引用错误', async () => {
    const pending = requests(),
      promise = store.loadUsage();
    pending[0].success({ data: { success: true, data: { entitlement: {}, cost: {} } } });
    expect(await promise).toMatchObject({ success: false, code: 502 });
    expect(store.modelUsageState.phase).toBe('error');
    expect(store.usage).toBeNull();
  });
  it('取消后立即可重新读取；忽略abort的迟到旧回执不能覆盖新列表或解锁新请求', async () => {
    const pending = requests(),
      first = store.loadModels();
    const cancelled = expect(first).rejects.toMatchObject({ code: 'CANCELLED' });
    store.cancelModelReads('models');
    await cancelled;
    expect(pending[0].abort).toHaveBeenCalledOnce();
    expect(store.modelListState.phase).toBe('idle');
    const retry = store.loadModels();
    pending[0].success({ data: modelResult('late-old') });
    await Promise.resolve();
    expect(store.modelListState.phase).toBe('loading');
    expect(store.models).toEqual([]);
    pending[1].success({ data: modelResult('fresh') });
    await retry;
    expect(store.models[0].id).toBe('fresh');
  });
  it.each(['delete', 'restore'])('同账户另一窗口%s后的旧读取被拒绝', async (kind) => {
    const pending = requests(),
      promise = store.loadModels();
    const rejected = expect(promise).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    mutate(peer, kind, backup);
    pending[0].success({ data: modelResult('stale') });
    await rejected;
    expect(store.models).toEqual([]);
    expect(store.modelListState.phase).toBe('idle');
  });
  it('账户切走再切回仍拒绝旧列表；不依赖页面refresh恰好看到中间账户', async () => {
    const pending = requests(),
      promise = store.loadModels();
    const rejected = expect(promise).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    storageService.saveLoginSession({ userId: 'synthetic-second-owner', token: 'fixture-peer', userInfo: {} });
    learningRepository.read();
    storageService.saveLoginSession({ userId: 'synthetic-crosswindow-owner', token: 'fixture-back', userInfo: {} });
    pending[0].success({ data: modelResult('old-account') });
    await rejected;
    expect(store.models).toEqual([]);
  });
  it.each(['same-window', 'encrypted-storage', 'compat-encrypted-storage', 'token-removal'])(
    'actual encrypted login revokes an in-flight read on %s and rejects its late result',
    async (change) => {
      const pending = requests();
      storageService.saveLoginSession({ userId: 'synthetic-second-owner', token: 'fixture-peer', userInfo: {} });
      const peerIdentity = uni.getStorageSync('_enc_EXAM_USER_ID');
      storageService.save('EXAM_USER_ID', 'synthetic-crosswindow-owner', true);
      storageService.saveLoginSession({
        userId: 'synthetic-crosswindow-owner',
        token: 'synthetic-encrypted-lifecycle-token',
        userInfo: {}
      });
      expect(uni.getStorageSync('EXAM_USER_ID')).toBe('');
      const before = store.exportData();
      const promise = store.loadModels();
      const rejected = expect(promise).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
      if (change === 'same-window') storageService.save('EXAM_USER_ID', 'synthetic-second-owner', true);
      else if (change === 'token-removal') storageService.remove('EXAM_TOKEN', true);
      else {
        uni.removeStorageSync('_enc_EXAM_SESSION_EPOCH');
        uni.setStorageSync('_enc_EXAM_USER_ID', peerIdentity);
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: change === 'encrypted-storage' ? '_enc_EXAM_USER_ID' : '__exam_storage__:_enc_EXAM_USER_ID'
          })
        );
      }
      expect(pending[0].abort).toHaveBeenCalledOnce();
      await rejected;
      // Even an A -> B -> A change and an adapter that ignores abort cannot revive the old read.
      storageService.save('EXAM_USER_ID', 'synthetic-crosswindow-owner', true);
      storageService.saveLoginSession({
        userId: 'synthetic-crosswindow-owner',
        token: 'fixture-only-token',
        userInfo: {}
      });
      pending[0].success({ data: modelResult('late-old-account') });
      await Promise.resolve();
      expect(store.models).toEqual([]);
      expect(store.modelListState.phase).toBe('idle');
      expect(store.exportData()).toBe(before);
    }
  );
  it('普通学习写入保持读取许可；列表和用量互不取消，取消列表后用量仍可完成', async () => {
    const pending = requests(),
      list = store.loadModels(),
      usage = store.loadUsage();
    const rejected = expect(list).rejects.toMatchObject({ code: 'CANCELLED' });
    peer.commit({
      id: 'ordinary-profile',
      type: 'profile.set',
      data: { field: 'foundation', value: '正常观察', source: 'self_report', scope: '当前任务' }
    });
    notify();
    expect(pending.every((request) => request.abort.mock.calls.length === 0)).toBe(true);
    store.cancelModelReads('models');
    await rejected;
    expect(store.modelUsageState.phase).toBe('loading');
    pending[1].success({ data: usageResult });
    await usage;
    expect(store.usage.entitlement.weeklyUnits).toBe(10);
    expect(store.modelUsageState.phase).toBe('ready');
  });
  it('Store销毁终止读取，忽略取消的回执不更新旧实例', async () => {
    const pending = requests(),
      promise = store.loadUsage();
    const rejected = expect(promise).rejects.toMatchObject({ code: 'CANCELLED' });
    store.$dispose();
    await rejected;
    pending[0].success({ data: usageResult });
    await Promise.resolve();
    expect(store.usage).toBeNull();
    expect(pending[0].abort).toHaveBeenCalledOnce();
  });
  it('未登录可继续本地学习；读取提示登录且零网络请求', async () => {
    uni.removeStorageSync('EXAM_TOKEN');
    const transport = vi.spyOn(uni, 'request');
    await expect(store.loadModels()).resolves.toMatchObject({ success: false, code: 401 });
    expect(store.modelListState).toMatchObject({
      phase: 'error',
      message: '登录后可继续，本机记录保留。'
    });
    expect(transport).not.toHaveBeenCalled();
    expect(store.selectedMode).toBe('offline');
  });
  it('共享记录不可读时主动终止读取并清除已展示的旧配置，原学习数据不被覆盖', async () => {
    const pending = requests(),
      first = store.loadModels();
    pending[0].success({ data: modelResult() });
    await first;
    const original = store.exportData(),
      reading = store.loadUsage();
    const rejected = expect(reading).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    const read = vi.spyOn(learningRepository, 'read').mockImplementation(() => {
      throw new Error('fixture storage unavailable');
    });
    notify();
    await rejected;
    expect(pending[1].abort).toHaveBeenCalledOnce();
    expect(store.models).toEqual([]);
    expect(store.usage).toBeNull();
    expect(store.modelUsageState.phase).toBe('idle');
    read.mockRestore();
    expect(store.exportData()).toBe(original);
  });
});
describe('加密同账户会话与凭据请求边界', () => {
  const originalToken = 'synthetic-original-session-token';
  const renewedToken = 'synthetic-renewed-session-token';
  function session() {
    store.$dispose();
    storageService.save('EXAM_USER_ID', 'synthetic-crosswindow-owner', true);
    storageService.save('EXAM_TOKEN', originalToken, true);
    setActivePinia(createPinia());
    store = useConversationLearningStore();
    store.start('12 + 8');
    store.submit('19', true, 'same-account-original');
    const search = store.searchRecords('19');
    store.openRecord(search.items[0].id, search.context);
    store.modelId = 'explicit-model';
    store.models = [
      {
        id: 'explicit-model',
        provider: '合成',
        model: 'explicit-model',
        source: 'byok',
        configured: true,
        capabilities: { structured: true }
      }
    ];
    store.modelPresets = [{ id: 'explicit-preset' }];
    store.usage = { fixture: 'kept-usage' };
    store.selectedMode = 'cloud';
    store.sharingAllowed = true;
    store.streamEnabled = false;
    store.localConnection = {
      endpoint: 'http://127.0.0.1:8765/chat',
      allowedOrigins: ['http://127.0.0.1:8765'],
      token: 'TEST_ONLY_SESSION_LOCAL_TOKEN_32_CHARS',
      model: 'local-fixture',
      consent: true
    };
    store.materialConnection = { ...store.localConnection, endpoint: 'http://127.0.0.1:8765/parse' };
    expect(uni.getStorageSync('EXAM_TOKEN')).toBe('');
    expect(uni.getStorageSync('_enc_EXAM_TOKEN')).toBeTruthy();
  }
  const config = () =>
    JSON.parse(
      JSON.stringify(
        Object.fromEntries(
          [
            'modelId',
            'models',
            'modelPresets',
            'usage',
            'selectedMode',
            'sharingAllowed',
            'streamEnabled',
            'localConnection',
            'materialConnection'
          ].map((key) => [key, store[key]])
        )
      )
    );
  function requests() {
    const pending = [];
    vi.spyOn(uni, 'request').mockImplementation((options) => {
      const abort = vi.fn();
      if (options.url.endsWith('/learning-models') && options.data.action === 'preferences') {
        options.success({ data: { success: true, data: { preferences: options.data.preferences } } });
      } else pending.push({ ...options, abort });
      return { abort };
    });
    return pending;
  }
  const models = (id) => ({
    success: true,
    data: {
      models: [
        { id, provider: '合成', model: id, source: 'byok', configured: true, capabilities: {} },
        {
          id: 'explicit-model',
          provider: '合成',
          model: 'explicit-model',
          source: 'byok',
          configured: true,
          capabilities: { structured: true }
        }
      ],
      presets: []
    }
  });
  const usage = { success: true, data: null };
  function change(kind) {
    if (kind === 'refresh') storageService.save('EXAM_TOKEN', renewedToken, true);
    else if (kind === 'same-token') storageService.save('EXAM_TOKEN', originalToken, true);
    else storageService.save('userInfo', { nickname: '同账户资料' }, true);
  }
  function peerLogin(epoch = 'synthetic-peer-login-epoch', owner = 'synthetic-crosswindow-owner') {
    // A peer committed the complete generation protocol; its storage events are still queued.
    const generation = (uni.getStorageSync('EXAM_IDENTITY_GENERATION') || 0) + 1;
    const revocation = `peer-revocation-${generation}`;
    uni.setStorageSync(
      '_enc_EXAM_SESSION_EPOCH',
      obfuscate({
        version: 1,
        generation,
        epoch,
        owner,
        token: originalToken,
        userInfo: {},
        proof: sessionCredentialProof(owner, originalToken),
        revocation
      })
    );
    uni.setStorageSync('EXAM_SESSION_REVOCATION', revocation);
    uni.setStorageSync('EXAM_SESSION_ENABLED', true);
    uni.setStorageSync('EXAM_IDENTITY_GENERATION', generation);
  }
  function expectReset() {
    expect(store.locatedRecord).toBeNull();
    expect(store.conversationLocation).toBeNull();
    expect(store.models).toEqual([]);
    expect(store.modelPresets).toEqual([]);
    expect(store.usage).toBeNull();
    // Same owner restores the saved BYOK choice (2026-10-26 rule); it stays offline until the catalog confirms it.
    expect(store.modelId).toBe('explicit-model');
    expect(store.selectedMode).toBe('offline');
    expect(store.localConnection).toBeNull();
    expect(store.materialConnection).toBeNull();
    expect(store.sharingAllowed).toBe(true); // same owner restores the saved account preference
  }
  it.each(['epoch-first', 'removed-first', 'restored-first'])(
    '跨窗口退出再登同账户的积压事件%s完整撤销所有旧读取',
    async (order) => {
      session();
      const originalEpoch = getLoginSessionEpoch();
      const pending = requests(),
        list = store.loadModels(),
        readUsage = store.loadUsage();
      const rejectedList = expect(list).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
      const rejectedUsage = expect(readUsage).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
      const facts = store.exportData();
      const removed = { key: '_enc_EXAM_TOKEN', oldValue: 'synthetic-old-ciphertext', newValue: null };
      const restored = { key: '_enc_EXAM_USER_ID', oldValue: null, newValue: 'synthetic-restored-ciphertext' };
      const epoch = {
        key: '_enc_EXAM_SESSION_EPOCH',
        oldValue: 'synthetic-old-epoch',
        newValue: 'synthetic-new-epoch'
      };
      peerLogin();
      expect(getLoginSessionEpoch()).not.toBe(originalEpoch);
      for (const event of order === 'epoch-first'
        ? [epoch, restored, removed]
        : order === 'removed-first'
          ? [removed, epoch, restored]
          : [restored, removed, epoch])
        window.dispatchEvent(new StorageEvent('storage', event));
      await Promise.all([rejectedList, rejectedUsage]);
      expect(pending.every((request) => request.abort.mock.calls.length === 1)).toBe(true);
      expectReset();
      requestFor(pending, 'list').success({ data: models('late-revoked-model') });
      requestFor(pending, 'usage').success({ data: usage });
      await Promise.resolve();
      expectReset();
      expect(store.exportData()).toBe(facts);
      expect(pending).toHaveLength(2);
    }
  );
  it.each(
    ['EXAM_USER_ID', 'EXAM_TOKEN', 'EXAM_SESSION_EPOCH'].flatMap((key) => [
      key,
      `_enc_${key}`,
      `__exam_storage__:${key}`,
      `__exam_storage__:_enc_${key}`
    ])
  )('积压%s删除后重读持久换代，拒绝迟到本地正文', async (key) => {
    session();
    store.selectedMode = 'local';
    let resolve;
    const transport = vi.fn(() => new Promise((done) => (resolve = done)));
    vi.stubGlobal('fetch', transport);
    const promise = store.send('请再解释一下');
    const rejected = expect(promise).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    const facts = store.exportData();
    // Revocation is observed from persisted state; a delayed event cannot revoke a later binding.
    peerLogin('synthetic-post-revocation-epoch');
    const epoch = getLoginSessionEpoch();
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue: 'synthetic-deleted-value', newValue: null }));
    expect(getLoginSessionEpoch()).toBe(epoch);
    expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
    expectReset();
    resolve({ ok: true, text: async () => JSON.stringify({ success: true, data: { message: '撤销前的迟到正文' } }) });
    await rejected;
    expect(store.exportData()).toBe(facts);
    expect(store.active.messages.some((m) => m.content === '撤销前的迟到正文')).toBe(false);
    expect(store.busy).toBe(false);
  });
  it.each(['changed', 'removed'])('跨窗口代号%s但尚无事件时结果核对仍拒绝正文', async (kind) => {
    session();
    store.selectedMode = 'local';
    let resolve;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((done) => (resolve = done)))
    );
    const promise = store.send('请再解释一下'),
      facts = store.exportData();
    if (kind === 'changed') peerLogin();
    else uni.removeStorageSync('_enc_EXAM_SESSION_EPOCH');
    resolve({ ok: true, text: async () => JSON.stringify({ success: true, data: { message: '事件未达的迟到正文' } }) });
    await expect(promise).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    if (kind === 'removed')
      expect(JSON.stringify(uni.getStorageSync('u_synthetic-crosswindow-owner_conversation_learning_v1'))).toBe(
        JSON.stringify(JSON.parse(facts))
      );
    else expect(store.exportData()).toBe(facts);
    expect(store.active?.messages.some((m) => m.content === '事件未达的迟到正文')).not.toBe(true);
    expect(getLoginSessionEpoch()).toBe(kind === 'removed' ? null : 'synthetic-peer-login-epoch');
  });
  it('代号换代取消资料连接和历史读取，不采纳忽略取消的迟到结果', async () => {
    session();
    let resolveMaterial, resolveHistory, historySignal;
    const transport = vi.fn(() => new Promise((done) => (resolveMaterial = done)));
    vi.stubGlobal('fetch', transport);
    vi.spyOn(learningRepository, 'previewGuestMigration').mockImplementation(({ signal }) => {
      historySignal = signal;
      return new Promise((done) => (resolveHistory = done));
    });
    const material = store.checkMaterialConnection(),
      history = store.previewGuestMigration();
    const materialRejected = expect(material).rejects.toThrow();
    const historyRejected = expect(history).rejects.toThrow();
    const facts = store.exportData();
    peerLogin();
    window.dispatchEvent(new StorageEvent('storage', { key: '_enc_EXAM_SESSION_EPOCH' }));
    expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
    expect(historySignal.aborted).toBe(true);
    expectReset();
    resolveMaterial({ ok: true, text: async () => JSON.stringify({ ok: true, ocrEngines: {} }) });
    resolveHistory({ owner: 'synthetic-crosswindow-owner', fixture: 'old-preview' });
    await Promise.all([materialRejected, historyRejected]);
    expect(store.exportData()).toBe(facts);
  });
  it('同账户成功重新登录换代并重置；正常刷新保持新代号', () => {
    session();
    const oldEpoch = getLoginSessionEpoch(),
      facts = store.exportData();
    storageService.saveLoginSession({ userId: 'synthetic-crosswindow-owner', token: originalToken, userInfo: {} });
    expect(getLoginSessionEpoch()).not.toBe(oldEpoch);
    expectReset();
    const epoch = getLoginSessionEpoch();
    change('refresh');
    change('profile');
    expect(getLoginSessionEpoch()).toBe(epoch);
    expect(store.exportData()).toBe(facts);
  });
  it('老用户Store首次读取补代号，既有原答和登录保持', () => {
    session();
    const facts = store.exportData();
    store.$dispose();
    uni.removeStorageSync('EXAM_SESSION_ENABLED'); // genuinely never-enabled legacy device
    uni.removeStorageSync('_enc_EXAM_SESSION_EPOCH');
    expect(getLoginSessionEpoch()).toBeNull();
    setActivePinia(createPinia());
    store = useConversationLearningStore();
    expect(getLoginSessionEpoch()).toBeTruthy();
    expect(store.state.owner).toBe('synthetic-crosswindow-owner');
    expect(store.state.attempts.at(-1).answer).toBe('19');
    expect(store.exportData()).toBe(facts);
  });
  it('审计P1：通知未到的新操作先撤销旧配置，零外发和零学习写入', async () => {
    session();
    store.selectedMode = 'local';
    const transport = vi.fn();
    vi.stubGlobal('fetch', transport);
    const facts = store.exportData();
    peerLogin();
    await expect(store.send('这次应要求重新授权')).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    expectReset();
    expect(transport).not.toHaveBeenCalled();
    expect(store.exportData()).toBe(facts);
    store.start('新会话的本机任务');
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(['changed', 'removed', 'cancelled'])(
    '审计P2：原件删除在%s后不写material.original-deleted，忽略abort也拒收',
    async (kind) => {
      session();
      const fileId = 'a'.repeat(64),
        material = parsePastedMaterial('合成私人原件', 'epoch-original');
      material.original = { connectorFileId: fileId, connectorOrigin: 'http://127.0.0.1:8765' };
      store.commit('material.add', { material });
      learningRepository.deleteMaterial(store.previewMaterialDeletion(material.id), true, 'epoch-deletion');
      store.refresh();
      const deletion = store.state.materialDeletions.at(-1);
      let resolve;
      const transport = vi.fn(() => new Promise((done) => (resolve = done)));
      vi.stubGlobal('fetch', transport);
      const promise = store.retryOriginalDeletion(deletion.deletionId, true);
      const rejected = expect(promise).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
      const facts = learningRepository.exportData();
      if (kind === 'changed') peerLogin();
      else if (kind === 'removed') uni.removeStorageSync('_enc_EXAM_SESSION_EPOCH');
      else store.cancelMaterial();
      resolve({ ok: true, text: async () => JSON.stringify({ success: true, data: { fileId, deleted: true } }) });
      await rejected;
      const saved =
        kind === 'removed'
          ? uni.getStorageSync('u_synthetic-crosswindow-owner_conversation_learning_v1')
          : learningRepository.read();
      expect(JSON.stringify(saved)).toBe(JSON.stringify(JSON.parse(facts)));
      expect(saved.materialDeletions.at(-1).originalStatus).toBe('pending');
      expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
    }
  );
  it('审计P2：明文令牌刷新加密后重放全部真实迁移事件，本地请求和授权保持', async () => {
    session();
    uni.removeStorageSync('_enc_EXAM_TOKEN');
    uni.setStorageSync('EXAM_TOKEN', originalToken);
    store.selectedMode = 'local';
    const epoch = getLoginSessionEpoch(),
      before = config();
    let resolve;
    const transport = vi.fn(() => new Promise((done) => (resolve = done)));
    vi.stubGlobal('fetch', transport);
    const promise = store.send('解释当前合成题');
    const events = [];
    const originalSet = uni.setStorageSync.getMockImplementation(),
      originalRemove = uni.removeStorageSync.getMockImplementation();
    vi.spyOn(uni, 'setStorageSync').mockImplementation((key, value) => {
      const oldValue = uni.getStorageSync(key) || null;
      originalSet(key, value);
      events.push({ key, oldValue, newValue: value });
    });
    vi.spyOn(uni, 'removeStorageSync').mockImplementation((key) => {
      const oldValue = uni.getStorageSync(key) || null;
      originalRemove(key);
      if (oldValue !== null) events.push({ key, oldValue, newValue: null });
    });
    const set = localStorage.setItem.getMockImplementation(),
      remove = localStorage.removeItem.getMockImplementation();
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      const oldValue = localStorage.getItem(key);
      set(key, value);
      events.push({ key, oldValue, newValue: value });
    });
    vi.spyOn(localStorage, 'removeItem').mockImplementation((key) => {
      const oldValue = localStorage.getItem(key);
      remove(key);
      if (oldValue !== null) events.push({ key, oldValue, newValue: null });
    });
    expect(storageService.save('EXAM_TOKEN', renewedToken, true)).toBe(true);
    expect(events.some((event) => event.key === 'EXAM_TOKEN' && event.newValue === null)).toBe(true);
    for (const event of events) window.dispatchEvent(new StorageEvent('storage', event));
    expect(getLoginSessionEpoch()).toBe(epoch);
    expect(config()).toEqual(before);
    expect(transport.mock.calls[0][1].signal.aborted).toBe(false);
    resolve({
      ok: true,
      text: async () => JSON.stringify({ success: true, data: { message: '迁移后有效的本地回复' } })
    });
    await promise;
    expect(store.active.messages.some((message) => message.content === '迁移后有效的本地回复')).toBe(true);
    expect(Object.keys(global.__mockStorage).some((key) => key.startsWith('__exam_identity_migration_v1:'))).toBe(
      false
    );
  });
  it('全部导出action在无通知换代后先完整重置，写入/请求全拒绝，只读操作可重读', async () => {
    session();
    const actions = Object.keys(store).filter((name) => !/^[$_]/.test(name) && typeof store[name] === 'function');
    expect(actions.length).toBeGreaterThan(90);
    const safeReads = new Set([
      'reloadRecords',
      'refresh',
      'searchRecords',
      'openRecord',
      'openReminder',
      'dismissLocatedRecord',
      'locateConversation',
      'selectTraining',
      'scopedSummary',
      'recordContext',
      'materialContext',
      'journeyContext',
      'writingContext',
      'oatutorContext',
      'computeReferenceContext',
      'sentenceCanSubmit',
      'vocabularyTaskFor',
      'vocabularyCanSubmit',
      'scienceCanSubmit',
      'writingCanSubmit',
      'reminderQueue',
      'notificationContext',
      'observeCalendar',
      'attachNotifications',
      'exportData',
      'isSyncConflictCurrent',
      'exportSyncConflict',
      'cancel',
      'cancelMaterial',
      'cancelSync',
      'cancelHistory',
      'cancelModelReads',
      'cancelModelIntake',
      'openModelConnector',
      'modelErrorPresentation',
      'loadModelDiscovery'
    ]);
    const transport = vi.fn();
    vi.stubGlobal('fetch', transport);
    const request = vi.spyOn(uni, 'request');
    for (const [index, name] of actions.entries()) {
      store.$dispose();
      uni.clearStorageSync();
      session();
      const before = JSON.stringify(global.__mockStorage);
      peerLogin(`peer_traversal_epoch_${index}`);
      const afterLogin = JSON.stringify(global.__mockStorage);
      let result;
      try {
        result = store[name]();
      } catch (failure) {
        result = Promise.reject(failure);
      }
      if (safeReads.has(name)) await Promise.resolve(result).catch(() => undefined);
      else await expect(Promise.resolve(result), name).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
      expectReset();
      expect(JSON.stringify(global.__mockStorage), name).toBe(afterLogin);
      expect(before).not.toBe(afterLogin);
    }
    expect(transport).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
  it('恢复副本写完后换代，在下一笔事实存储前拒写并完整重置', () => {
    session();
    const facts = store.exportData(),
      save = storageService.save.bind(storageService);
    vi.spyOn(storageService, 'save').mockImplementation((key, ...args) => {
      const result = save(key, ...args);
      if (key === `${LEARNING_KEY}_recovery`) peerLogin();
      return result;
    });
    expect(() =>
      store.commit('profile.set', { field: 'foundation', value: '不能落盘', source: 'self_report', scope: '本题' })
    ).toThrow();
    expectReset();
    expect(learningRepository.exportData()).toBe(facts);
  });
  it('完整重置立即拒绝忽略abort的旧请求，新授权可操作且旧finally不解锁新请求', async () => {
    session();
    store.selectedMode = 'local';
    const connection = JSON.parse(JSON.stringify(store.localConnection)),
      replies = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => replies.push(resolve)))
    );
    const old = store.send('旧会话请求');
    const rejected = expect(old).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    peerLogin();
    expect(() => store.ensureSessionCurrent()).toThrow();
    await rejected;
    expect(store.busy).toBe(false);
    store.localConnection = connection;
    store.selectedMode = 'local';
    store.sharingAllowed = true;
    const fresh = store.send('新会话授权后的请求');
    expect(replies).toHaveLength(2);
    replies[0]({ ok: true, text: async () => JSON.stringify({ success: true, data: { message: '旧请求不得保存' } }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.busy).toBe(true);
    replies[1]({ ok: true, text: async () => JSON.stringify({ success: true, data: { message: '新会话正常保存' } }) });
    await fresh;
    expect(store.active.messages.some((message) => message.content === '旧请求不得保存')).toBe(false);
    expect(store.active.messages.some((message) => message.content === '新会话正常保存')).toBe(true);
    expect(store.busy).toBe(false);
  });
  it('Store初始化期间另一窗口换代，完整建立资源后再重读，不使用未初始化引用', () => {
    session();
    const facts = store.exportData();
    store.$dispose();
    const lifecycle = learningRepository.lifecycleContext.bind(learningRepository);
    let changed = false;
    vi.spyOn(learningRepository, 'lifecycleContext').mockImplementation(() => {
      if (!changed) {
        changed = true;
        peerLogin('synthetic-initialization-peer-epoch');
      }
      return lifecycle();
    });
    setActivePinia(createPinia());
    store = useConversationLearningStore();
    expect(() => store.ensureSessionCurrent()).not.toThrow();
    expectReset();
    expect(store.exportData()).toBe(facts);
  });
  it('换代后重新确认的通知上下文绑定持久代号，普通Store重开仍保持', () => {
    session();
    const previous = store.prepareNotificationConsent();
    peerLogin();
    expect(() => store.ensureSessionCurrent()).toThrow();
    const renewed = store.prepareNotificationConsent();
    expect(renewed).not.toBe(previous);
    const facts = store.exportData();
    store.$dispose();
    setActivePinia(createPinia());
    store = useConversationLearningStore();
    expect(store.notificationContext()).toBe(renewed);
    expect(store.exportData()).toBe(facts);
  });
  it.each(['same-window', 'encrypted-storage', 'compat-encrypted-storage'])(
    '%s续期保留同账户进行中读取，新读取使用新令牌',
    async (source) => {
      // Produce peer ciphertext with the real service before attaching this Store.
      store.$dispose();
      storageService.save('EXAM_TOKEN', renewedToken, true);
      const encrypted = uni.getStorageSync('_enc_EXAM_TOKEN');
      session();
      const pending = requests(),
        list = store.loadModels(),
        readUsage = store.loadUsage();
      const before = config(),
        facts = store.exportData(),
        original = store.locatedRecord;
      expect(requestFor(pending, 'list').header.Authorization).toBe(`Bearer ${originalToken}`);
      if (source === 'same-window') change('refresh');
      else {
        uni.setStorageSync('_enc_EXAM_TOKEN', encrypted);
        uni.setStorageSync(
          '_enc_EXAM_SESSION_EPOCH',
          obfuscate({
            ...deobfuscate(uni.getStorageSync('_enc_EXAM_SESSION_EPOCH')),
            token: renewedToken,
            proof: sessionCredentialProof('synthetic-crosswindow-owner', renewedToken)
          })
        );
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: source === 'encrypted-storage' ? '_enc_EXAM_TOKEN' : '__exam_storage__:_enc_EXAM_TOKEN'
          })
        );
      }
      expect(pending).toHaveLength(2);
      expect(pending.every((request) => request.abort.mock.calls.length === 0)).toBe(true);
      expect(config()).toEqual(before);
      expect(store.locatedRecord).toBe(original);
      expect(store.exportData()).toBe(facts);
      requestFor(pending, 'list').success({ data: models('continued-model') });
      requestFor(pending, 'usage').success({ data: usage });
      await Promise.all([list, readUsage]);
      expect(store.models[0].id).toBe('continued-model');
      const retry = store.loadModels();
      expect(requestFor(pending, 'list', 1).header.Authorization).toBe(`Bearer ${renewedToken}`);
      requestFor(pending, 'list', 1).success({ data: models('fresh-token-model') });
      await retry;
      expect(store.models[0].id).toBe('fresh-token-model');
      expect(store.modelId).toBe('explicit-model');
      expect(store.selectedMode).toBe('cloud');
      expect(store.sharingAllowed).toBe(true);
    }
  );
  it.each(['same-token', 'profile'])('%s不取消使用相同凭据的进行中读取', async (kind) => {
    session();
    const pending = requests(),
      list = store.loadModels(),
      readUsage = store.loadUsage();
    const before = config(),
      facts = store.exportData(),
      original = store.locatedRecord;
    change(kind);
    expect(config()).toEqual(before);
    expect(store.locatedRecord).toBe(original);
    expect(pending.every((request) => request.abort.mock.calls.length === 0)).toBe(true);
    expect(store.modelListState.phase).toBe('loading');
    pending[0].success({ data: models('continued-model') });
    pending[1].success({ data: usage });
    await Promise.all([list, readUsage]);
    expect(store.models[0].id).toBe('continued-model');
    expect(store.modelUsageState.phase).toBe('empty');
    expect(store.exportData()).toBe(facts);
  });
  it.each(['refresh', 'same-token', 'profile'])('%s不取消独立资料连接的进行中请求', async (kind) => {
    session();
    let resolve;
    const transport = vi.fn(() => new Promise((r) => (resolve = r)));
    vi.stubGlobal('fetch', transport);
    const promise = store.checkMaterialConnection(),
      before = config(),
      original = store.locatedRecord;
    change(kind);
    expect(transport.mock.calls[0][1].signal.aborted).toBe(false);
    expect(config()).toEqual(before);
    expect(store.locatedRecord).toBe(original);
    resolve({ ok: true, text: async () => JSON.stringify({ success: true, data: { version: 'isolated-parser' } }) });
    await promise;
    expect(store.materialConnection.status).toBe('connector_verified');
  });
  it.each(['refresh', 'same-token', 'profile'])('%s不取消本地模型进行中的作答', async (kind) => {
    session();
    store.selectedMode = 'local';
    let resolve;
    const transport = vi.fn(() => new Promise((r) => (resolve = r)));
    vi.stubGlobal('fetch', transport);
    const promise = store.send('请再解释一下'),
      before = config();
    expect(transport).toHaveBeenCalledOnce();
    change(kind);
    expect(transport.mock.calls[0][1].signal.aborted).toBe(false);
    expect(config()).toEqual(before);
    resolve({ ok: true, text: async () => JSON.stringify({ success: true, data: { message: '本地模型继续完成' } }) });
    await promise;
    expect(store.active.messages.at(-1).content).toBe('本地模型继续完成');
    expect(store.busy).toBe(false);
  });
  it.each(['refresh', 'same-token', 'profile'])('%s同账户云端生成继续完成', async (kind) => {
    session();
    const pending = requests(),
      promise = store.send('请再解释一下'),
      before = config();
    expect(requestFor(pending, '/proxy-ai').url).toMatch(/\/proxy-ai$/);
    store.streamPreview = '已显示的临时预览';
    change(kind);
    expect(config()).toEqual(before);
    expect(requestFor(pending, '/proxy-ai').abort).not.toHaveBeenCalled();
    requestFor(pending, '/proxy-ai').success({
      data: { success: true, data: { message: '云端生成已完成', tools: [] } }
    });
    await promise;
    expect(store.active.messages.some((message) => message.content === '云端生成已完成')).toBe(true);
    expect(store.busy).toBe(false);
    expect(store.modelId).toBe('explicit-model');
    expect(store.selectedMode).toBe('cloud');
    expect(store.sharingAllowed).toBe(true);
  });
  it('续期保留同账户进行中同步，不自动重放且保留原答', async () => {
    session();
    const pending = requests(),
      promise = store.syncRecords(true);
    const before = config(),
      facts = store.exportData();
    expect(requestFor(pending, '/learning-sync').url).toMatch(/\/learning-sync$/);
    change('refresh');
    expect(requestFor(pending, '/learning-sync').abort).not.toHaveBeenCalled();
    expect(config()).toEqual(before);
    const { normalizePrivateSyncOperation } = await import('@/services/learning/learning-domain.js');
    const remote = learningRepository.read();
    remote.events = remote.events.map(normalizePrivateSyncOperation);
    requestFor(pending, '/learning-sync').success({ data: { success: true, data: { state: remote } } });
    await promise;
    expect(pending.filter((item) => item.url.endsWith('/learning-sync'))).toHaveLength(1);
    expect(requestFor(pending, 'list').data).toEqual({ action: 'list' });
    requestFor(pending, 'list').success({ data: { success: true, data: { models: [], presets: [] } } });
    const previous = JSON.parse(facts);
    for (const field of ['attempts', 'questions', 'plans', 'profile'])
      expect(store.state[field]).toEqual(previous[field]);
    expect(store.syncBusy).toBe(false);
  });
  it.each(['refresh', 'same-token', 'profile'])('%s不取消不依赖账户凭据的本机历史校验', async (kind) => {
    session();
    let resolve, signal;
    vi.spyOn(learningRepository, 'previewGuestMigration').mockImplementation((options) => {
      signal = options.signal;
      return new Promise((r) => (resolve = r));
    });
    const promise = store.previewGuestMigration(),
      before = config(),
      facts = store.exportData();
    change(kind);
    expect(signal.aborted).toBe(false);
    expect(store.historyBusy).toBe(true);
    expect(config()).toEqual(before);
    const preview = { owner: 'synthetic-crosswindow-owner', fixture: 'local-history-preview' };
    resolve(preview);
    await expect(promise).resolves.toBe(preview);
    expect(store.historyBusy).toBe(false);
    expect(store.exportData()).toBe(facts);
  });
  it('退出提交后再登录相同ID/令牌仍作为新会话重置', async () => {
    session();
    await storageService._clearRevokedCredentials();
    uni.$on.mock.calls.findLast(([name]) => name === 'user:logout')[1]();
    store.selectedMode = 'local';
    store.modelId = 'logged-out-choice';
    store.sharingAllowed = true;
    await storageService.saveLoginSession({
      userId: 'synthetic-crosswindow-owner',
      token: originalToken,
      userInfo: {}
    });
    // The logged-out choice is dropped; the account's saved choice returns offline until the catalog confirms it.
    expect(store.modelId).toBe('explicit-model');
    expect(store.selectedMode).toBe('offline');
    expect(store.sharingAllowed).toBe(true);
  });
  it('没有可靠账户ID时，重复资料写入也按切换处理，宁可撤销不复用访客授权', () => {
    session();
    storageService.remove('EXAM_USER_ID', true);
    store.selectedMode = 'local';
    store.modelId = 'unverified-owner-choice';
    store.sharingAllowed = true;
    storageService.save('userInfo', { nickname: '无法据此确认账户' }, true);
    expect(store.modelId).toBe('');
    expect(store.selectedMode).toBe('offline');
    expect(store.sharingAllowed).toBe(false);
  });
  it.each(['account', 'logout', '401-logout', 'token-removal', 'missing-id', 'unreliable-id'])(
    '%s仍完整重置，切回同账户后拒绝旧回执并保留已存事实',
    async (kind) => {
      session();
      const pending = requests(),
        promise = store.loadModels();
      const rejected = expect(promise).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
      const facts = store.exportData();
      if (kind === 'account') storageService.save('EXAM_USER_ID', 'synthetic-second-owner', true);
      else if (kind === 'token-removal') storageService.remove('EXAM_TOKEN', true);
      else if (kind === 'missing-id') storageService.remove('EXAM_USER_ID', true);
      else if (kind === 'unreliable-id') storageService.save('EXAM_USER_ID', '   ', true);
      else {
        // The committed logout is authoritative; notifications only request a reread.
        await storageService._clearRevokedCredentials();
        uni.$on.mock.calls.findLast(([name]) => name === 'user:logout')[1](
          kind === '401-logout' ? { code: 401 } : undefined
        );
      }
      await rejected;
      expect(pending[0].abort).toHaveBeenCalledOnce();
      expect(store.locatedRecord).toBeNull();
      expect(store.conversationLocation).toBeNull();
      expect(store.models).toEqual([]);
      expect(store.modelPresets).toEqual([]);
      expect(store.usage).toBeNull();
      expect(store.modelId).toBe('');
      expect(store.selectedMode).toBe('offline');
      expect(store.localConnection).toBeNull();
      expect(store.materialConnection).toBeNull();
      expect(store.sharingAllowed).toBe(false);
      storageService.saveLoginSession({ userId: 'synthetic-crosswindow-owner', token: originalToken, userInfo: {} });
      pending[0].success({ data: models('late-pre-logout') });
      await Promise.resolve();
      expect(store.models).toEqual([]);
      expect(store.selectedMode).toBe('offline');
      expect(store.exportData()).toBe(facts);
    }
  );
});
describe('Store共享撤销标记与浏览器事件', () => {
  it.each(['delete', 'restore'])('另一Repository%s后旧健康回执不采纳', async (kind) => {
    let resolve;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((r) => (resolve = r)))
    );
    const p = store.checkMaterialConnection(),
      rejected = expect(p).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    mutate(peer, kind, backup);
    resolve({
      ok: true,
      text: async () =>
        JSON.stringify({ success: true, data: { version: 'isolated-parser', pdfText: true, pagePreview: true } })
    });
    await rejected;
  });
  it.each(['delete', 'restore'])('另一Repository%s后Storage事件主动取消旧解析且不保存迟到资料', async (kind) => {
    let resolve;
    const transport = vi.fn(() => new Promise((r) => (resolve = r)));
    vi.stubGlobal('fetch', transport);
    const p = store.importFile({ name: 'synthetic.pdf', size: 4, contentBase64: 'dGVzdA==' });
    const rejected = expect(p).rejects.toMatchObject({ code: expect.stringMatching(/^(CANCELLED|CONTEXT_CHANGED)$/) });
    mutate(peer, kind, backup);
    notify();
    expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
    resolve({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          data: {
            id: 'late',
            fingerprint: 'late',
            scope: 'private',
            segments: [{ id: 'one', content: '迟到资料' }],
            totalPages: 1,
            nextPage: null
          }
        })
    });
    await rejected;
    expect(learningRepository.read().materials).toHaveLength(0);
  });
  it('资料动作写入权被拒绝时正文零传输、不锁busy', async () => {
    const transport = vi.fn();
    vi.stubGlobal('fetch', transport);
    vi.spyOn(learningRepository, 'assertWriteAccess').mockImplementation(() => {
      throw Object.assign(new Error('另一窗口'), { code: 'OTHER_WINDOW_ACTIVE' });
    });
    await expect(store.importFile({ name: 'synthetic.pdf', size: 4, contentBase64: 'dGVzdA==' })).rejects.toMatchObject(
      { code: 'OTHER_WINDOW_ACTIVE' }
    );
    expect(transport).not.toHaveBeenCalled();
    expect(store.materialBusy).toBe(false);
  });
  it('不同账户Storage事件不刷新或撤销当前上下文', () => {
    const context = store.materialContext(),
      before = store.state;
    window.dispatchEvent(new StorageEvent('storage', { key: `u_someone_else_${epochKey}` }));
    expect(store.state).toBe(before);
    expect(store.materialContext()).toBe(context);
  });
});

describe('H5兼容存储不缓存跨窗口学习根及标记', () => {
  it('另一个窗口写入/移除兼容localStorage后读到最新值', () => {
    localStorage.clear();
    vi.stubGlobal('uni', undefined);
    vi.stubGlobal('wx', undefined);
    const service = new StorageService();
    expect(
      service.save(
        epochKey,
        { owner: 'guest', contract: 'learning-lifecycle-v1', generation: 'initial_12345678' },
        true
      )
    ).toBe(true);
    expect(service.get(epochKey).generation).toBe('initial_12345678');
    const key = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).find((key) =>
      key.endsWith(epochKey)
    );
    expect(key).toBeTruthy();
    localStorage.setItem(
      key,
      JSON.stringify({ value: { owner: 'guest', contract: 'learning-lifecycle-v1', generation: 'peer_123456789' } })
    );
    expect(service.get(epochKey).generation).toBe('peer_123456789');
    localStorage.removeItem(key);
    expect(service.get(epochKey, null)).toBeNull();
  });
});

describe('标记初始化与只读上下文', () => {
  it('首次资料动作初始化不改变本窗口记录身份，标记不携带正文或凭据', () => {
    const map = new Map(),
      storage = {
        get: (key, fallback) => map.get(key) ?? fallback,
        save: (key, value) => {
          map.set(key, structuredClone(value));
          return true;
        },
        remove: () => true
      };
    const repo = createLearningRepository(storage, () => 'u1');
    const before = repo.lifecycleContext();
    repo.prepareAsyncAction();
    expect(repo.lifecycleContext()).toEqual(before);
    expect([...map.keys()]).toEqual([epochKey]);
    expect(Object.keys(map.get(epochKey)).sort()).toEqual(['contract', 'generation', 'owner']);
  });
  it('首次初始化保存失败不生成学习事实或改变生命周期', () => {
    const repo = createLearningRepository(
      { get: (_key, fallback) => fallback, save: () => false, remove: () => true },
      () => 'u1'
    );
    expect(() => repo.prepareAsyncAction()).toThrow('撤销标记');
    expect(repo.lifecycleRevision()).toBe(0);
  });
  it('损坏共享标记时健康与解析都零传输，不在watch中抛异常', async () => {
    const transport = vi.fn();
    vi.stubGlobal('fetch', transport);
    storageService.save(
      epochKey,
      { owner: 'someone-else', contract: 'learning-lifecycle-v1', generation: '12345678' },
      true
    );
    notify();
    expect(store.materialContext()).toBeNull();
    await expect(store.checkMaterialConnection()).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    await expect(store.importFile({ name: 'synthetic.pdf', size: 4, contentBase64: 'dGVzdA==' })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect(store.materialBusy).toBe(false);
  });
  it('真实根Storage事件刷新删除后的事实；普通学习事件保持文件许可', () => {
    const before = store.materialContext();
    peer.commit({
      id: 'profile-peer',
      type: 'profile.set',
      data: { field: 'foundation', value: '普通观察', source: 'self_report', scope: '当前任务' }
    });
    window.dispatchEvent(new StorageEvent('storage', { key: `u_synthetic-crosswindow-owner_${LEARNING_KEY}` }));
    expect(store.materialContext()).toBe(before);
    expect(store.state.events.some((event) => event.id === 'profile-peer')).toBe(true);
    peer.deleteData();
    window.dispatchEvent(new StorageEvent('storage', { key: `u_synthetic-crosswindow-owner_${LEARNING_KEY}` }));
    expect(store.state.events).toHaveLength(0);
    expect(store.materialContext()).not.toBe(before);
  });
  it('Store卸载移除Storage监听，迟到事件不刷新旧实例', () => {
    const before = store.state;
    store.$dispose();
    peer.deleteData();
    notify();
    expect(store.state).toBe(before);
  });
});

// Stage 5: use the real entry points. Fixture fallback keeps these scenarios executable on 2c739ff4.
describe('阶段5入口绑定回归', () => {
  const owner = 'audit5-A',
    token = 'fixture-audit5-token';
  const binding = () => storageService.captureSession?.() || { owner: 'audit5-A', epoch: getLoginSessionEpoch() };
  const login = (userId = owner) =>
    storageService.saveLoginSession({
      userId,
      token: userId === owner ? token : 'fixture-audit5-B-token',
      userInfo: { uid: userId }
    });
  const question = {
    id: 'audit5-q',
    question: 'A_PRIVATE_QUESTION',
    options: ['甲', '乙'],
    answer: 'A',
    subject: '数学'
  };
  beforeEach(async () => {
    store?.$dispose();
    uni.clearStorageSync();
    await login();
    setActivePinia(createPinia());
    store = useConversationLearningStore();
  });
  it('writes-1: study engine never persists A clusters with B plan', async () => {
    const { useStudyEngineStore } = await import('@/stores/modules/study-engine.js');
    const engine = useStudyEngineStore();
    engine.lastClusters = [{ questionContent: 'PRIVATE_A_CLUSTER', userAnswer: 'PRIVATE_A_ANSWER' }];
    await login('audit5-B');
    await engine.generateStudyPlan('2026-12-01');
    expect(JSON.stringify(uni.getStorageSync('u_audit5-B_study_engine_state_v1'))).not.toContain('PRIVATE_A');
    engine.$dispose();
  });
  it('writes-2: analytics timer discards A queue before B storage', async () => {
    const { analytics } = await import('@/utils/analytics/event-bus-analytics.js');
    analytics.isInitialized = false;
    analytics.eventQueue = [];
    vi.useFakeTimers();
    try {
      analytics.init({ enableDebug: false });
      await login('audit5-B');
      await vi.advanceTimersByTimeAsync(60001);
      expect(JSON.stringify(uni.getStorageSync('u_audit5-B_analytics_uploaded'))).not.toContain('audit5-A');
    } finally {
      clearInterval(analytics.uploadTimer);
      analytics.stopIdentity?.();
      analytics.isInitialized = false;
      analytics.eventQueue = [];
      vi.useRealTimers();
    }
  });
  it.each(['attempt', 'reference', 'recorder'])(
    'writes-3: %s waiting for lease cannot survive relogin',
    async (kind) => {
      const bridge = await import('@/services/learning/quiz-learning-bridge.js');
      const { learningWriteLease } = await import('@/services/learning/learning-write-lease.js');
      const { recordAnswerToAnalytics } = await import('@/pages/practice-sub/quiz-analytics-recorder.js');
      let release;
      vi.spyOn(learningWriteLease, 'waitUntilWritable').mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          })
      );
      const transport = vi.spyOn(uni, 'request');
      const params = { currentQuestion: question, sessionId: 'quiz_audit5_session', attemptId: 'attempt_audit5_1' };
      const pending =
        kind === 'attempt'
          ? bridge.recordQuizLearningAttempt({ ...params, userAnswer: 'A' })
          : kind === 'reference'
            ? bridge.recordQuizLearningObservation({
                ...params,
                observationId: 'observe_audit5_1',
                kind: 'reference_view'
              })
            : recordAnswerToAnalytics({ ...params, userChoice: 0, getOptionLabel: () => 'A', timeSpent: 1000 });
      const outcome = pending.catch((error) => ({ code: error.code }));
      await login();
      release();
      await outcome;
      expect(learningRepository.read().attempts).toHaveLength(0);
      expect(learningRepository.read().events).toHaveLength(0);
      expect(transport).not.toHaveBeenCalled();
    }
  );
  it('writes-4: queued mistake removal retains the originating epoch', async () => {
    storageService.save('mistake_book', [{ id: 'local_audit5', question: 'PRIVATE_A' }], true);
    let release;
    storageService._mistakeBookMutex = new Promise((resolve) => {
      release = resolve;
    });
    const pending = storageService.removeMistake('local_audit5');
    await login();
    release();
    expect(await pending).toMatchObject({ success: false, code: 'CONTEXT_CHANGED' });
    expect(storageService.get('mistake_book', [])).toHaveLength(1);
  });
  it('inflight-1: identity read interleaving never sends A body with B credentials', async () => {
    const { learningRequest } = await import('@/services/api/domains/learning.api.js');
    const session = binding();
    const read = uni.getStorageSync.getMockImplementation();
    let switched = false;
    vi.spyOn(uni, 'getStorageSync').mockImplementation((key) => {
      const value = read(key);
      if (!switched && key === '_enc_EXAM_SESSION_EPOCH') {
        switched = true;
        login('audit5-B');
      }
      return value;
    });
    const sent = [];
    vi.spyOn(uni, 'request').mockImplementation((options) => {
      sent.push(options);
      options.success({ data: { success: true } });
      return { abort() {} };
    });
    const result = await learningRequest(
      '/learning-sync',
      { action: 'push', operations: [{ private: 'A_PRIVATE_GOAL' }] },
      { session, expectedOwner: owner }
    );
    expect(result.success).toBe(false);
    expect(sent).toHaveLength(0);
  });
  it('inflight-2: progress callback cannot rebind a pending sync push', async () => {
    const { synchronizeLearning } = await import('@/services/learning/learning-sync.js');
    const { learningRequest } = await import('@/services/api/domains/learning.api.js');
    const { emptyLearningState } = await import('@/services/learning/learning-domain.js');
    store.start('PRIVATE_SYNC_A');
    const requests = [];
    vi.spyOn(uni, 'request').mockImplementation((options) => {
      requests.push(options.data.action);
      options.success({ data: { success: true, data: { state: emptyLearningState(owner), revision: 0 } } });
      return { abort() {} };
    });
    await expect(
      synchronizeLearning(learningRepository, true, learningRequest, {
        onProgress(progress) {
          if (progress.phase === '补传学习操作') login();
        }
      })
    ).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    expect(requests).toEqual(['pull']);
  });
  it.each(['saveModel', 'testModel', 'removeModel'])(
    'inflight-3: %s continuation does not load B models',
    async (action) => {
      const sent = [],
        callbacks = [];
      vi.spyOn(uni, 'request').mockImplementation((options) => {
        sent.push(options.data.action);
        callbacks.push(options);
        return { abort() {} };
      });
      const pending = store[action](action === 'saveModel' ? { name: 'A_PRIVATE_PROFILE' } : 'profile-a', true);
      const rejected = expect(pending).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
      callbacks[0].success({ data: { success: true, data: {} } });
      queueMicrotask(() => login('audit5-B'));
      await rejected;
      await Promise.resolve();
      await Promise.resolve();
      expect(sent).toHaveLength(1);
      expect(sent).not.toContain('list');
    }
  );
  it('regress-1: silent cache restoration keeps active epoch and authorization', async () => {
    const { useAuthStore } = await import('@/stores/modules/auth.js');
    store.localConnection = { endpoint: 'private-connection', token: 'fixture-local' };
    store.sharingAllowed = true;
    const epoch = getLoginSessionEpoch();
    const pinia = createPinia();
    const auth = useAuthStore(pinia);
    auth._setUserInfoRef(ref({ uid: owner }));
    expect(auth.silentLogin().success).toBe(true);
    expect(getLoginSessionEpoch()).toBe(epoch);
    expect(store.localConnection?.endpoint).toBe('private-connection');
    expect(store.sharingAllowed).toBe(true);
    for (const item of pinia._s.values()) item.$dispose();
  });
  it('regress-2: one epoch read error preserves model and connection configuration', () => {
    store.modelId = 'chosen-profile';
    store.sharingAllowed = true;
    store.localConnection = { endpoint: 'private-connection' };
    const read = uni.getStorageSync.getMockImplementation();
    let failed = false;
    vi.spyOn(uni, 'getStorageSync').mockImplementation((key) => {
      if (!failed && key === '_enc_EXAM_SESSION_EPOCH') {
        failed = true;
        throw new Error('FIXTURE_READ_ERROR');
      }
      return read(key);
    });
    try {
      store.recordContext();
    } catch {
      /* The current action may report a retryable read failure. */
    }
    expect(store.modelId).toBe('chosen-profile');
    expect(store.localConnection?.endpoint).toBe('private-connection');
    expect(store.sharingAllowed).toBe(true);
    expect(store.recordContext()).toBeTruthy();
  });
  it('R1: interleaved login writes cannot bless mixed owner and token', async () => {
    const { learningRequest } = await import('@/services/api/domains/learning.api.js');
    const original = captureSession();
    const write = uni.setStorageSync.getMockImplementation();
    let crossed = false;
    vi.spyOn(uni, 'setStorageSync').mockImplementation((key, value) => {
      if (!crossed && key === '_enc_EXAM_TOKEN') {
        crossed = true;
        login('audit5-B');
      }
      write(key, value);
    });
    try {
      await login();
    } catch {
      /* No Web Locks: reject the torn transaction. */
    }
    const transport = vi.spyOn(uni, 'request');
    expect(captureSession()?.owner).toBe('audit5-B');
    const result = await learningRequest('/learning-models', { action: 'list' }, { session: original });
    expect(result.success).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });
  it('R2: remount cannot resurrect credentials after epoch revocation', async () => {
    storageService.remove('EXAM_SESSION_EPOCH', true);
    const pinia = createPinia();
    const remounted = useConversationLearningStore(pinia);
    const transport = vi.spyOn(uni, 'request');
    await remounted.loadModels().catch(() => undefined);
    expect(getLoginSessionEpoch()).toBeNull();
    expect(transport).not.toHaveBeenCalled();
    remounted.$dispose();
  });
  it('R3: intercepted recovery write cannot resolve to the new partition', async () => {
    store.start('OWNER_A_PRIVATE_ORIGINAL');
    const save = storageService.save.bind(storageService);
    let switched = false;
    vi.spyOn(storageService, 'save').mockImplementation((key, ...args) => {
      if (!switched && key === `${LEARNING_KEY}_recovery`) {
        switched = true;
        login('audit5-B');
      }
      return save(key, ...args);
    });
    expect(() =>
      store.commit('profile.set', { field: 'foundation', value: 'A-private', source: 'self_report', scope: 'test' })
    ).toThrow();
    expect(JSON.stringify(uni.getStorageSync(`u_audit5-B_${LEARNING_KEY}_recovery`))).not.toContain('OWNER_A_PRIVATE');
  });
});

it('R2: remount stays empty while revoked credential cleanup waits for a Web Lock', async () => {
  store.$dispose();
  uni.clearStorageSync();
  await storageService.saveLoginSession({ userId: 'revoked-mount-owner', token: 'fixture-token', userInfo: {} });
  uni.removeStorageSync('_enc_EXAM_SESSION_EPOCH');
  const previous = navigator.locks;
  const cleanup = [];
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name, _options, write) =>
        new Promise((resolve) => {
          cleanup.push(() => resolve(write()));
        })
    }
  });
  let mounted;
  try {
    const pinia = createPinia();
    expect(() => {
      mounted = useConversationLearningStore(pinia);
    }).not.toThrow();
    expect(mounted.state.events).toHaveLength(0);
    expect(getLoginSessionEpoch()).toBeNull();
    expect(cleanup.length).toBeGreaterThan(0);
    for (const complete of cleanup) complete();
    await Promise.resolve();
    expect(storageService.get('EXAM_TOKEN')).toBeNull();
    expect(getLoginSessionEpoch()).toBeNull();
  } finally {
    mounted?.$dispose();
    if (previous) Object.defineProperty(navigator, 'locks', { configurable: true, value: previous });
    else delete navigator.locks;
  }
});

it('deferred note content keeps its page session when the manager has switched accounts', async () => {
  const { addQuestionNote } = await import('@/pages/practice-sub/question-note.js');
  await storageService.saveLoginSession({ userId: 'note-A', token: 'fixture-token-A', userInfo: {} });
  const session = storageService.captureSession();
  await storageService.saveLoginSession({ userId: 'note-B', token: 'fixture-token-B', userInfo: {} });
  expect(addQuestionNote({ questionId: 'q-A', content: 'PRIVATE_A_NOTE' }, session).success).toBe(false);
  expect(JSON.stringify(storageService.get('question_notes', []))).not.toContain('PRIVATE_A_NOTE');
});
