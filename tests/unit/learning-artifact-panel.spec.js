import crypto from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import Panel from '@/components/business/learning/muse-artifact-panel.vue';
import Library from '@/components/business/learning/muse-library.vue';
import CustomModal from '@/components/common/CustomModal.vue';
import {
  studentEssaySources,
  artifactWorkspace,
  openStudentArtifact,
  createLearningArtifacts
} from '@/services/learning/learning-artifacts.js';
import { requestLearningArtifact } from '@/services/api/domains/learning.api.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
import { storageService } from '@/services/storageService.js';
import { artifactFixtureState, artifactMemoryDatabase } from '../fixtures/learning-artifacts.js';
import { handleLearningArtifacts } from '../../laf-backend/functions/learning-artifacts';
const harness = vi.hoisted(() => ({ store: null }));
vi.mock('@/stores/modules/conversation-learning.js', () => ({ useConversationLearningStore: () => harness.store }));
vi.mock('@/services/api/domains/learning.api.js', async (original) => ({
  ...(await original()),
  requestLearningArtifact: vi.fn()
}));
vi.mock('@/utils/safe-navigate.js', () => ({ safeNavigateTo: vi.fn() }));
vi.mock('@dcloudio/uni-app', () => ({ onShow: vi.fn(), onHide: vi.fn(), onLoad: vi.fn(), onBackPress: vi.fn() }));
let wrappers, fixture, item, target, original;
beforeEach(async () => {
  setActivePinia(createPinia());
  uni.clearStorageSync();
  localStorage.clear();
  wrappers = [];
  uni.setStorageSync('EXAM_USER_ID', 'artifact-student');
  uni.setStorageSync('EXAM_TOKEN', 'ARTIFACT_SYNTHETIC_NOT_VALID');
  const state = artifactFixtureState();
  item = studentEssaySources(state)[0];
  original = JSON.stringify(state);
  harness.store = reactive({
    state,
    busy: false,
    syncBusy: false,
    syncRecords: vi.fn(),
    cancelSync: vi.fn(),
    calendarTime: 1793361600000,
    locateConversation: vi.fn(),
    focus: vi.fn(),
    recordContext() {
      return this.state.owner + ':context';
    }
  });
  fixture = artifactMemoryDatabase();
  await fixture.db.collection('learning_states').add({
    _id: 'learning_sync_' + crypto.createHash('sha256').update(state.owner).digest('hex'),
    user_id: state.owner,
    state,
    revision: 7
  });
  requestLearningArtifact.mockImplementation(async (body) => {
    try {
      return { success: true, data: await handleLearningArtifacts(fixture.db, 'artifact-student', body) };
    } catch (e) {
      return { success: false, errorCode: e.code };
    }
  });
  openStudentArtifact(harness.store, item);
  target = artifactWorkspace(harness.store).target;
});
afterEach(() => {
  wrappers.forEach((w) => w.unmount());
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function render(component = Panel, extra = {}) {
  const wrapper = mount(component, {
    ...(component === Panel ? { props: { target } } : {}),
    attachTo: document.body,
    global: { stubs: { BaseIcon: true, ...extra } }
  });
  wrappers.push(wrapper);
  return wrapper;
}
const tap = (w, text) =>
  w
    .findAll('button')
    .find((b) => b.text() === text)
    .trigger('tap');
async function ready() {
  await flushPromises();
  await nextTick();
}

describe('S4 artifact panel and library', () => {
  function s48DeviceDraft(pinned = true) {
    const client = createLearningArtifacts();
    // A prior fault deliberately revoked its write base; the new fixture must
    // perform a checked read before preparing another local pin operation.
    client.readDraft(item.id);
    client.readPin(item.id);
    client.writeDraft(item.id, {
      version: 1,
      title: item.title,
      content: 'S48 original pending words must remain.',
      mode: 'edit',
      scrollTop: 0,
      pending: { requestId: 's48-original-request', signature: 's48-frozen-input' }
    });
    client.setPin(item.id, pinned);
    const key = uni.getStorageInfoSync().keys.find((key) => key.endsWith('pin:' + item.id));
    expect(key).toBeTruthy();
    return { client, key };
  }
  it('S48 retries local pin reads explicitly in the same context without changing draft or facts', async () => {
    const { client, key } = s48DeviceDraft();
    const before = JSON.stringify(globalThis.__mockStorage),
      context = harness.store.recordContext();
    const reader = uni.getStorageSync;
    let unavailable = true,
      attempts = 0;
    uni.getStorageSync = (name) => {
      if (name === key) {
        attempts++;
        if (unavailable) throw new Error('S48 synthetic pin read failure');
      }
      return reader(name);
    };
    try {
      const w = render(Library);
      await ready();
      expect(w.get('[role="alert"]').text()).toContain('持久化数据暂不可读，请重试');
      const retry = w.get('[data-library-pin-retry]');
      for (const pin of w.findAll('.artifact-pin')) {
        expect(pin.attributes('disabled')).toBeDefined();
        expect(pin.attributes('aria-pressed')).toBeUndefined();
        await pin.trigger('tap');
      }
      expect(JSON.stringify(globalThis.__mockStorage)).toBe(before);
      await retry.trigger('tap');
      await ready();
      expect(attempts).toBe(2);
      expect(w.find('[data-library-pin-retry]').exists()).toBe(true);
      expect(JSON.stringify(globalThis.__mockStorage)).toBe(before);
      unavailable = false;
      await w.get('[data-library-pin-retry]').trigger('tap');
      await ready();
      expect(harness.store.recordContext()).toBe(context);
      expect(w.find('[role="alert"]').exists()).toBe(false);
      expect(w.get('[aria-label="取消置顶"]').attributes('aria-pressed')).toBe('true');
      expect(client.readDraft(item.id).pending).toEqual({
        requestId: 's48-original-request',
        signature: 's48-frozen-input'
      });
      expect(JSON.stringify(globalThis.__mockStorage)).toBe(before);
      expect(requestLearningArtifact).not.toHaveBeenCalled();
      expect(JSON.stringify(harness.store.state)).toBe(original);
    } finally {
      uni.getStorageSync = reader;
    }
  });
  it('S48 a partial pin read leaves individual and selected pin controls unknown and disabled', async () => {
    const { client } = s48DeviceDraft();
    const second = JSON.parse(JSON.stringify(harness.store.state.conversations[0]));
    second.id = 's48-second-conversation';
    harness.store.state.conversations.push(second);
    const other = studentEssaySources(harness.store.state).find((source) => source.conversationId === second.id);
    client.setPin(other.id, true);
    const key = uni.getStorageInfoSync().keys.find((key) => key.endsWith('pin:' + other.id));
    const before = JSON.stringify(globalThis.__mockStorage),
      reader = uni.getStorageSync;
    uni.getStorageSync = (name) => {
      if (name === key) throw new Error('S48 synthetic second pin read failure');
      return reader(name);
    };
    try {
      const w = render(Library);
      await ready();
      expect(w.findAll('.artifact-pin')).toHaveLength(2);
      expect(
        w
          .findAll('.artifact-pin')
          .every((pin) => pin.attributes('disabled') !== undefined && pin.attributes('aria-pressed') === undefined)
      ).toBe(true);
      await tap(w, '选择');
      await w
        .findAll('.artifact')
        .find((card) => card.attributes('aria-label') === '选择 ' + item.title)
        .trigger('tap');
      const bulk = w.findAll('.library-head-actions button').find((button) => button.text() === '置顶');
      expect(bulk.attributes('disabled')).toBeDefined();
      await bulk.trigger('tap');
      expect(JSON.stringify(globalThis.__mockStorage)).toBe(before);
      expect(requestLearningArtifact).not.toHaveBeenCalled();
    } finally {
      uni.getStorageSync = reader;
    }
  });
  it('S48 a retry after an account change reads the current namespace and keeps the former records', async () => {
    const { key } = s48DeviceDraft();
    const owned = () =>
      Object.entries(globalThis.__mockStorage).filter(([key]) => key.startsWith('u_artifact-student_'));
    const before = JSON.stringify(owned()),
      reader = uni.getStorageSync;
    uni.getStorageSync = (name) => {
      if (name === key) throw new Error('S48 synthetic pin read failure');
      return reader(name);
    };
    try {
      const w = render(Library);
      await ready();
      const retry = w.get('[data-library-pin-retry]');
      uni.getStorageSync = reader;
      uni.setStorageSync('EXAM_USER_ID', 's48-another-student');
      uni.setStorageSync('EXAM_TOKEN', 'S48_SYNTHETIC_NEXT_NOT_VALID');
      harness.store.state = artifactFixtureState('s48-another-student');
      await retry.trigger('tap');
      await ready();
      expect(w.find('[role="alert"]').exists()).toBe(false);
      expect(w.get('[aria-label="置顶"]').attributes('aria-pressed')).toBe('false');
      expect(createLearningArtifacts().readDraft(item.id)).toBeNull();
      expect(JSON.stringify(owned())).toBe(before);
      expect(requestLearningArtifact).not.toHaveBeenCalled();
    } finally {
      uni.getStorageSync = reader;
    }
  });
  it.each(['individual', 'selected'])(
    'S48 read-only retry after a committed %s pin write never replays that write',
    async (mode) => {
      const { key, client } = s48DeviceDraft(false);
      const reader = uni.getStorageSync,
        writer = uni.setStorageSync;
      const save = vi.spyOn(storageService, 'save');
      let unavailable = false,
        writes = 0;
      uni.getStorageSync = (name) => {
        if (name === key && unavailable) throw new Error('S48 synthetic pin readback failure');
        return reader(name);
      };
      uni.setStorageSync = (name, value) => {
        const result = writer(name, value);
        if (name === key) {
          writes++;
          unavailable = true;
        }
        return result;
      };
      try {
        const w = render(Library);
        await ready();
        if (mode === 'individual') await w.get('.artifact-pin').trigger('tap');
        else {
          await tap(w, '选择');
          await w
            .findAll('.artifact')
            .find((card) => card.attributes('aria-label') === '选择 ' + item.title)
            .trigger('tap');
          await w
            .findAll('.library-head-actions button')
            .find((button) => button.text() === '置顶')
            .trigger('tap');
        }
        await ready();
        expect(writes).toBe(1);
        expect(w.get('[data-library-pin-retry]').exists()).toBe(true);
        unavailable = false;
        await w.get('[data-library-pin-retry]').trigger('tap');
        await ready();
        expect(w.find('[role="alert"]').exists()).toBe(false);
        expect(writes).toBe(1);
        expect(save.mock.calls.filter(([key]) => key.endsWith('pin:' + item.id))).toHaveLength(1);
        expect(client.readPin(item.id)).toBe(true);
        expect(client.readDraft(item.id).pending.requestId).toBe('s48-original-request');
        expect(requestLearningArtifact).not.toHaveBeenCalled();
        expect(JSON.stringify(harness.store.state)).toBe(original);
      } finally {
        uni.getStorageSync = reader;
        uni.setStorageSync = writer;
      }
    }
  );
  it('S47 shows the identity retry message and restores the owned unsaved draft after reads recover', async () => {
    const client = createLearningArtifacts();
    client.writeDraft(item.id, {
      version: 1,
      title: item.title,
      content: 'S47 keep the unsaved owned words.',
      mode: 'edit',
      scrollTop: 0,
      pending: null
    });
    const before = JSON.stringify(globalThis.__mockStorage);
    const reader = uni.getStorageSync;
    uni.getStorageSync = () => {
      throw new Error('S47 synthetic identity read failure');
    };
    try {
      const w = render();
      await ready();
      expect(w.get('[role="alert"]').text()).toContain('登录状态暂不可读，请重试');
      expect(w.text()).not.toContain('Cannot read');
      expect(w.find('textarea').exists()).toBe(false);
      expect(w.find('[data-artifact-sync]').exists()).toBe(false);
      expect(requestLearningArtifact).not.toHaveBeenCalled();
      expect(JSON.stringify(globalThis.__mockStorage)).toBe(before);
      uni.getStorageSync = reader;
      await tap(w, '重试');
      await ready();
      expect(w.get('textarea').element.value).toBe('S47 keep the unsaved owned words.');
      expect(w.get('.artifact-panel-version').text()).toContain('版本 1');
      expect(requestLearningArtifact.mock.calls.map(([body]) => body.action)).toEqual(['open']);
      expect(JSON.stringify(harness.store.state)).toBe(original);
    } finally {
      uni.getStorageSync = reader;
    }
  });
  it('S47 library identity errors preserve existing draft and pin until a checked reread', async () => {
    const client = createLearningArtifacts();
    client.writeDraft(item.id, {
      version: 1,
      title: item.title,
      content: 'S47 preserve the pending library draft.',
      mode: 'edit',
      scrollTop: 0,
      pending: { requestId: 's47-frozen-request', signature: 's47-original-pending' }
    });
    client.setPin(item.id, true);
    const before = JSON.stringify(globalThis.__mockStorage);
    const reader = uni.getStorageSync;
    uni.getStorageSync = () => {
      throw new Error('S47 synthetic identity read failure');
    };
    try {
      const w = render(Library);
      await ready();
      expect(w.get('.library-pin-error-copy').text()).toBe('登录状态暂不可读，请重试');
      expect(w.text()).not.toContain('Cannot read');
      expect(JSON.stringify(globalThis.__mockStorage)).toBe(before);
      expect(requestLearningArtifact).not.toHaveBeenCalled();
      uni.getStorageSync = reader;
      harness.store.recordContext = () => 'artifact-student:after-identity-read-recovery';
      await ready();
      expect(w.find('[role="alert"]').exists()).toBe(false);
      expect(w.get('[aria-label="取消置顶"]').attributes('aria-pressed')).toBe('true');
      expect(client.readDraft(item.id)).toMatchObject({
        content: 'S47 preserve the pending library draft.',
        pending: { requestId: 's47-frozen-request', signature: 's47-original-pending' }
      });
      expect(JSON.stringify(harness.store.state)).toBe(original);
    } finally {
      uni.getStorageSync = reader;
    }
  });
  function unsyncSource() {
    const row = [...fixture.rows.values()][0];
    row.state.conversations = [];
    return row;
  }
  it('shows the owned local original when its cloud source is missing, and uploads only after explicit consent', async () => {
    const row = unsyncSource();
    harness.store.syncRecords.mockImplementation(async () => {
      row.state = structuredClone(JSON.parse(JSON.stringify(harness.store.state)));
      return harness.store.state;
    });
    const w = render();
    await ready();
    expect(w.text()).toContain('这份原文尚未同步');
    expect(w.text()).toContain('本机原稿');
    expect(w.get('.artifact-panel-content').text()).toBe(item.content);
    expect(w.find('[data-artifact-save]').exists()).toBe(false);
    expect(w.find('[data-version]').exists()).toBe(false);
    expect(harness.store.syncRecords).not.toHaveBeenCalled();
    await w.get('[data-artifact-sync]').trigger('tap');
    expect(w.getComponent(CustomModal).props('content')).toContain('私人资料片段、页图与学习记录');
    w.getComponent(CustomModal).vm.$emit('cancel');
    await ready();
    expect(harness.store.syncRecords).not.toHaveBeenCalled();
    expect(row.state.conversations).toEqual([]);
    await w.get('[data-artifact-sync]').trigger('tap');
    w.getComponent(CustomModal).vm.$emit('confirm');
    await ready();
    expect(harness.store.syncRecords).toHaveBeenCalledExactlyOnceWith(true);
    expect(w.get('.artifact-panel-content').text()).toBe(item.content);
    expect(w.get('.artifact-panel-version').text()).toContain('版本 1');
    expect(requestLearningArtifact.mock.calls.map(([body]) => body.action)).toEqual(['open', 'open']);
    expect(JSON.stringify(harness.store.state)).toBe(original);
  });
  it.each(['ARTIFACT_UNAVAILABLE', 'UNAUTHORIZED'])(
    'does not offer source synchronization or expose a local preview for unrelated failure %s',
    async (errorCode) => {
      requestLearningArtifact.mockResolvedValueOnce({ success: false, errorCode });
      const w = render();
      await ready();
      expect(w.find('[data-artifact-sync]').exists()).toBe(false);
      expect(w.find('.artifact-panel-content').exists()).toBe(false);
      expect(harness.store.syncRecords).not.toHaveBeenCalled();
    }
  );
  it('does not match a different training day merely because its artifact id is the same', async () => {
    unsyncSource();
    target.source.day = '2026-10-29';
    const w = render();
    await ready();
    expect(w.find('[data-artifact-sync]').exists()).toBe(false);
    expect(w.text()).not.toContain(item.content);
  });
  it('keeps the local original and allows retry after a failed or cancelled synchronization', async () => {
    const row = unsyncSource();
    harness.store.syncRecords.mockRejectedValue(
      Object.assign(new Error('同步已取消，本机记录保留'), { code: 'CANCELLED' })
    );
    const w = render();
    await ready();
    await w.get('[data-artifact-sync]').trigger('tap');
    w.getComponent(CustomModal).vm.$emit('confirm');
    await ready();
    expect(w.get('[role="alert"]').text()).toContain('同步已取消');
    expect(w.get('.artifact-panel-content').text()).toBe(item.content);
    expect(w.get('[data-artifact-sync]').attributes('disabled')).toBeUndefined();
    expect(row.state.conversations).toEqual([]);
    expect(requestLearningArtifact).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(harness.store.state)).toBe(original);
  });
  it('does not upload when the account changes while the synchronization confirmation is open', async () => {
    unsyncSource();
    const w = render();
    await ready();
    await w.get('[data-artifact-sync]').trigger('tap');
    harness.store.state = artifactFixtureState('another-student');
    w.getComponent(CustomModal).vm.$emit('confirm');
    await ready();
    expect(harness.store.syncRecords).not.toHaveBeenCalled();
    expect(w.text()).not.toContain(item.content);
  });
  it('does not reopen an old target after successful sync advances the lifecycle', async () => {
    unsyncSource();
    let finish;
    harness.store.syncRecords.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const w = render();
    await ready();
    await w.get('[data-artifact-sync]').trigger('tap');
    w.getComponent(CustomModal).vm.$emit('confirm');
    await ready();
    expect(w.text()).toContain('正在同步学习记录');
    await tap(w, '取消同步');
    expect(harness.store.cancelSync).toHaveBeenCalledOnce();
    harness.store.recordContext = () => 'artifact-student:after-sync';
    finish(harness.store.state);
    await ready();
    expect(requestLearningArtifact).toHaveBeenCalledTimes(1);
    expect(w.text()).not.toContain(item.content);
    expect(w.findAll('button').some((button) => button.text() === '取消同步')).toBe(false);
  });
  it('keeps a pending document mutation separate from missing-source recovery', async () => {
    unsyncSource();
    const client = createLearningArtifacts();
    const pending = {
      signature: JSON.stringify({
        action: 'save',
        id: item.id,
        expectedVersion: 1,
        title: item.title,
        content: 'Pending edit'
      }),
      requestId: 'pending-original-request'
    };
    client.writeDraft(item.id, {
      version: 1,
      title: item.title,
      content: 'Pending edit',
      mode: 'edit',
      scrollTop: 0,
      pending
    });
    const w = render();
    await ready();
    expect(w.find('[data-artifact-sync]').exists()).toBe(false);
    expect(w.get('textarea').element.value).toBe('Pending edit');
    expect(client.readDraft(item.id).pending).toEqual(pending);
    expect(harness.store.syncRecords).not.toHaveBeenCalled();
  });
  it('confirmed local deletion clears the real WebKit compatibility-storage namespace', () => {
    vi.stubGlobal('uni', undefined);
    vi.stubGlobal('wx', undefined);
    localStorage.setItem('EXAM_USER_ID', 'artifact-student');
    localStorage.setItem('EXAM_TOKEN', 'ARTIFACT_SYNTHETIC_NOT_VALID');
    const c = createLearningArtifacts();
    c.writeDraft(item.id, { version: 1, title: item.title, content: 'Unsaved local text', mode: 'edit', scrollTop: 0 });
    c.setPin(item.id, true);
    expect(c.owner).toBe('artifact-student');
    const physicalKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    expect(physicalKeys.some((key) => key.startsWith('__exam_storage__:u_artifact-student_'))).toBe(true);
    expect(c.clearDeviceState()).toBe(2);
    expect(c.readDraft(item.id)).toBeNull();
    expect(c.readPin(item.id)).toBe(false);
    expect(JSON.stringify(harness.store.state)).toBe(original);
  });
  it('B1/B7 uses Muse geometry/motion, mobile safe areas and a full-screen return', async () => {
    const css = readFileSync('src/components/business/learning/muse-artifact-panel.vue', 'utf8');
    expect(css).toMatch(/width: clamp\(340px, 44%, 520px\)/);
    expect(css).toContain('180ms ease-out');
    expect(css).toContain('160ms ease-in');
    expect(css).toContain('height: 100dvh');
    expect(css).toContain('safe-area-inset-bottom');
    vi.stubGlobal('innerWidth', 390);
    target.route = 'pages/archive/index';
    const w = render();
    await ready();
    await w.get('[aria-label="返回"]').trigger('tap');
    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(w.emitted('close')).toHaveLength(1);
    expect(harness.store.locateConversation).toHaveBeenCalledWith('essay-chat');
    expect(safeNavigateTo).toHaveBeenCalledWith('/pages/learning/index');
    vi.unstubAllGlobals();
  });
  it('B2/B6 library opens the same source without navigation, and Pin survives recreation', async () => {
    let w = render(Library);
    await ready();
    const pin = w.get('[aria-label="置顶"]');
    await pin.trigger('tap');
    expect(w.get('[aria-label="取消置顶"]').attributes('aria-pressed')).toBe('true');
    const card = w.get('[aria-label="取消置顶"]').element.parentElement.querySelector('.artifact');
    await w
      .findAll('.artifact')
      .find((b) => b.element === card)
      .trigger('tap');
    expect(artifactWorkspace(harness.store).target.id).toBe(item.id);
    expect(safeNavigateTo).not.toHaveBeenCalled();
    w.unmount();
    wrappers.pop();
    w = render(Library);
    await ready();
    expect(w.get('[aria-label="取消置顶"]').attributes('aria-pressed')).toBe('true');
    expect(JSON.stringify(harness.store.state)).toBe(original);
  });
  it('B3 a lost save response retries after App reconstruction without duplicating versions', async () => {
    let w = render();
    await ready();
    await tap(w, '编辑');
    await w.get('textarea').setValue('An edited copy.');
    const send = requestLearningArtifact.getMockImplementation();
    requestLearningArtifact.mockImplementationOnce(async (...args) => {
      await send(...args);
      return { success: false, code: 503 };
    });
    await w.get('[data-artifact-save]').trigger('tap');
    await ready();
    expect(w.find('[role="alert"]').exists()).toBe(true);
    w.unmount();
    wrappers.pop();
    w = render();
    await ready();
    await tap(w, '重试');
    await ready();
    expect(w.get('.artifact-panel-version').text()).toContain('版本 2');
    expect(w.get('.artifact-panel-version').text()).toContain('已保存');
    const row = Object.values([...fixture.rows.values()][0].essayArtifacts)[0];
    expect(row.versions).toHaveLength(2);
    expect(JSON.stringify(harness.store.state)).toBe(original);
  });
  it('S44 retry freezes a lost save request while preserving edits typed afterwards', async () => {
    const w = render();
    await ready();
    await tap(w, '编辑');
    await w.get('textarea').setValue('First copy awaiting its receipt.');
    const send = requestLearningArtifact.getMockImplementation();
    requestLearningArtifact.mockImplementationOnce(async (...args) => {
      await send(...args);
      return { success: false, code: 503 };
    });
    await w.get('[data-artifact-save]').trigger('tap');
    await ready();
    const first = requestLearningArtifact.mock.calls.filter(([body]) => body.action === 'save')[0][0];
    await w.get('textarea').setValue('Newer unsaved words must survive the retry.');
    await tap(w, '重试');
    await ready();
    const saves = requestLearningArtifact.mock.calls.filter(([body]) => body.action === 'save');
    expect(saves).toHaveLength(2);
    expect(saves[1][0]).toEqual(first);
    expect(w.get('textarea').element.value).toBe('Newer unsaved words must survive the retry.');
    expect(w.get('.artifact-panel-version').text()).toContain('版本 2');
    expect(w.get('.artifact-panel-version').text()).not.toContain('已保存');
    const row = Object.values([...fixture.rows.values()][0].essayArtifacts)[0];
    expect(row.versions).toHaveLength(2);
    expect(row.versions[1].content).toBe('First copy awaiting its receipt.');
    expect(w.get('[data-artifact-save]').attributes('disabled')).toBeUndefined();
    await w.get('[data-artifact-save]').trigger('tap');
    await ready();
    const afterSave = Object.values([...fixture.rows.values()][0].essayArtifacts)[0];
    expect(afterSave.versions).toHaveLength(3);
    expect(afterSave.versions[2].content).toBe('Newer unsaved words must survive the retry.');
    expect(JSON.stringify(harness.store.state)).toBe(original);
  });
  it('S44 lost restore retry after recreation keeps newer text and the original source and request id', async () => {
    let w = render();
    await ready();
    await tap(w, '编辑');
    await w.get('textarea').setValue('Saved second version.');
    await w.get('[data-artifact-save]').trigger('tap');
    await ready();
    await w.get('[data-artifact-history]').trigger('tap');
    await ready();
    await w.get('[data-artifact-version="1"]').trigger('tap');
    await ready();
    const send = requestLearningArtifact.getMockImplementation();
    requestLearningArtifact.mockImplementationOnce(async (...args) => {
      await send(...args);
      return { success: false, code: 503 };
    });
    await w.get('[data-artifact-restore]').trigger('tap');
    w.getComponent(CustomModal).vm.$emit('confirm');
    await ready();
    const first = requestLearningArtifact.mock.calls.filter(([body]) => body.action === 'restore')[0][0];
    await tap(w, '编辑');
    await w.get('textarea').setValue('New words after the restore reply was lost.');
    w.unmount();
    wrappers.pop();
    w = render();
    await ready();
    await tap(w, '重试');
    await ready();
    const restores = requestLearningArtifact.mock.calls.filter(([body]) => body.action === 'restore');
    expect(restores).toHaveLength(2);
    expect(restores[1][0]).toEqual(first);
    const row = Object.values([...fixture.rows.values()][0].essayArtifacts)[0];
    expect(row.versions).toHaveLength(3);
    expect(row.versions[2]).toMatchObject({ content: item.content, restoredFrom: 1 });
    expect(w.get('textarea').element.value).toBe('New words after the restore reply was lost.');
    expect(w.get('.artifact-panel-version').text()).toContain('版本 3');
    expect(w.get('.artifact-panel-version').text()).not.toContain('已保存');
    await w.get('[data-artifact-save]').trigger('tap');
    await ready();
    const afterSave = Object.values([...fixture.rows.values()][0].essayArtifacts)[0];
    expect(afterSave.versions).toHaveLength(4);
    expect(afterSave.versions[3].content).toBe('New words after the restore reply was lost.');
    expect(JSON.stringify(harness.store.state)).toBe(original);
  });
  it('S44 new save waits for the pending receipt and only confirmed reload abandons that local request', async () => {
    const w = render();
    await ready();
    await tap(w, '编辑');
    await w.get('textarea').setValue('Committed copy with its reply lost.');
    const send = requestLearningArtifact.getMockImplementation();
    requestLearningArtifact.mockImplementationOnce(async (...args) => {
      await send(...args);
      return { success: false, code: 503 };
    });
    await w.get('[data-artifact-save]').trigger('tap');
    await ready();
    const c = createLearningArtifacts();
    const pending = structuredClone(c.readDraft(item.id).pending);
    await w.get('textarea').setValue('Keep this until explicit reload.');
    await w.get('[data-artifact-save]').trigger('tap');
    await ready();
    expect(w.get('[role="alert"]').text()).toContain('请先重试');
    expect(requestLearningArtifact.mock.calls.filter(([body]) => body.action === 'save')).toHaveLength(1);
    expect(c.readDraft(item.id).pending).toEqual(pending);
    await tap(w, '重新载入');
    w.getComponent(CustomModal).vm.$emit('cancel');
    await ready();
    expect(w.get('textarea').element.value).toBe('Keep this until explicit reload.');
    expect(c.readDraft(item.id).pending).toEqual(pending);
    await tap(w, '重新载入');
    w.getComponent(CustomModal).vm.$emit('confirm');
    await ready();
    expect(c.readDraft(item.id).pending).toBeNull();
    await tap(w, '编辑');
    await w.get('textarea').setValue('Explicit fresh save based on the reloaded head.');
    await w.get('[data-artifact-save]').trigger('tap');
    await ready();
    const row = Object.values([...fixture.rows.values()][0].essayArtifacts)[0];
    expect(row.versions).toHaveLength(3);
    expect(row.versions[1].content).toBe('Committed copy with its reply lost.');
    expect(row.versions[2].content).toBe('Explicit fresh save based on the reloaded head.');
    expect(JSON.stringify(harness.store.state)).toBe(original);
  });
  it('B3/B4 retries a committed restore after App reconstruction with its original base and request id', async () => {
    let w = render();
    await ready();
    await tap(w, '编辑');
    await w.get('textarea').setValue('A saved second version.');
    await w.get('[data-artifact-save]').trigger('tap');
    await ready();
    await w.get('[data-artifact-history]').trigger('tap');
    await ready();
    await w.get('[data-artifact-version="1"]').trigger('tap');
    await ready();
    const send = requestLearningArtifact.getMockImplementation();
    requestLearningArtifact.mockImplementationOnce(async (...args) => {
      await send(...args);
      return { success: false, code: 503 };
    });
    await w.get('[data-artifact-restore]').trigger('tap');
    w.getComponent(CustomModal).vm.$emit('confirm');
    await ready();
    expect(w.find('[role="alert"]').exists()).toBe(true);
    const first = requestLearningArtifact.mock.calls.filter(([body]) => body.action === 'restore')[0][0];
    w.unmount();
    wrappers.pop();
    w = render();
    await ready();
    await tap(w, '重试');
    await ready();
    const retries = requestLearningArtifact.mock.calls.filter(([body]) => body.action === 'restore');
    expect(retries).toHaveLength(2);
    expect(retries[1][0]).toEqual(first);
    expect(w.get('.artifact-panel-version').text()).toContain('版本 3 · 已保存');
    const row = Object.values([...fixture.rows.values()][0].essayArtifacts)[0];
    expect(row.versions).toHaveLength(3);
    expect(row.versions[2]).toMatchObject({ restoredFrom: 1, content: item.content });
    expect(JSON.stringify(harness.store.state)).toBe(original);
  });
  it('B3/B4 stale save preserves edits; historical preview is read-only and restore creates v3', async () => {
    let w = render();
    await ready();
    await tap(w, '编辑');
    await w.get('textarea').setValue('My local draft');
    await handleLearningArtifacts(fixture.db, 'artifact-student', {
      action: 'save',
      id: item.id,
      expectedVersion: 1,
      requestId: 'external-writer',
      title: item.title,
      content: 'Remote saved copy'
    });
    w.unmount();
    wrappers.pop();
    w = render();
    await ready();
    expect(w.get('.artifact-panel-version').text()).toContain('版本 1');
    await w.get('[data-artifact-save]').trigger('tap');
    await ready();
    expect(w.get('.artifact-panel-error').text()).toContain('文档已有新版本');
    expect(w.get('textarea').element.value).toBe('My local draft');
    await tap(w, '重新载入');
    w.getComponent(CustomModal).vm.$emit('confirm');
    await ready();
    await w.get('[data-artifact-history]').trigger('tap');
    await ready();
    await w.get('[data-artifact-version="1"]').trigger('tap');
    await ready();
    expect(w.find('textarea').exists()).toBe(false);
    expect(w.get('.artifact-panel-content').text()).toBe(item.content);
    await w.get('[data-artifact-restore]').trigger('tap');
    w.getComponent(CustomModal).vm.$emit('confirm');
    await ready();
    expect(w.get('.artifact-panel-version').text()).toContain('版本 3');
    const row = Object.values([...fixture.rows.values()][0].essayArtifacts)[0];
    expect(row.versions[1].content).toBe('Remote saved copy');
    expect(row.versions[2].restoredFrom).toBe(1);
    expect(JSON.stringify(harness.store.state)).toBe(original);
  });
  it('B5 keeps an unsaved edit, editor position and mode through close and App reconstruction', async () => {
    let w = render();
    await ready();
    await tap(w, '编辑');
    await w.get('textarea').setValue('Keep this unsaved essay.');
    w.get('textarea').element.scrollTop = 94;
    const editorScroll = new Event('scroll');
    Object.defineProperty(editorScroll, 'target', { value: {} });
    w.get('textarea').element.dispatchEvent(editorScroll);
    w.get('.artifact-panel-body').element.scrollTop = 32;
    const bodyScroll = new Event('scroll');
    Object.defineProperty(bodyScroll, 'target', { value: {} });
    w.get('.artifact-panel-body').element.dispatchEvent(bodyScroll);
    await w.get('[aria-label="关闭文档"]').trigger('tap');
    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(w.emitted('close')).toHaveLength(1);
    w.unmount();
    wrappers.pop();
    w = render();
    await ready();
    expect(w.get('textarea').element.value).toBe('Keep this unsaved essay.');
    expect(w.get('textarea').element.scrollTop).toBe(94);
    expect(w.get('.artifact-panel-body').element.scrollTop).toBe(32);
    expect(w.get('.artifact-panel-version').text()).toContain('版本 1');
    expect(JSON.stringify(harness.store.state)).toBe(original);
  });
  it('rejects late reads after the account changes and never shows the previous student content', async () => {
    let finish;
    requestLearningArtifact.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const w = render();
    await ready();
    harness.store.state = artifactFixtureState('another-student');
    finish({ success: true, data: { schema: 'yozi.learning-artifact.v1' } });
    await ready();
    expect(w.find('textarea').exists()).toBe(false);
    expect(w.text()).not.toContain(item.content);
  });
  it('B7 website stays a separate read-only workspace and cannot mount the editor', () => {
    const source = readFileSync('src/components/business/website/website-workspace.vue', 'utf8');
    expect(source).not.toContain('MuseArtifactPanel');
    expect(source).not.toContain('openStudentArtifact');
    expect(source).not.toContain('requestLearningArtifact');
  });
});
