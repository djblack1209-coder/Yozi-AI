import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import Connectors from '@/components/business/learning/muse-ai-connectors.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import { MODEL_API_KEY_MAX_LENGTH } from '../../laf-backend/functions/_shared/ai-providers/model-endpoints.js';
const harness = vi.hoisted(() => ({ store: null, token: 'synthetic-token' }));
vi.mock('@/stores/modules/conversation-learning.js', () => ({ useConversationLearningStore: () => harness.store }));
vi.mock('@/services/auth-storage.js', async (original) => ({ ...(await original()), getToken: () => harness.token }));
const modal = {
  props: ['visible', 'title'],
  template:
    '<section v-if="visible" role="dialog"><h2>{{title}}</h2><button class="test-close" @click="$emit(\'cancel\')">关闭</button><slot /></section>'
};
let wrapper;
const saved = (id = 'one', extra = {}) => ({
  id,
  provider: 'DeepSeek',
  endpoint: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-flash',
  source: 'byok',
  configured: true,
  capabilities: { structured: true, stream: false },
  connectionStatus: 'connected',
  ...extra
});
beforeEach(() => {
  harness.token = 'synthetic-token';
  setActivePinia(createPinia());
  harness.store = reactive({
    owner: 'owner-a',
    busy: false,
    intakeBusy: false,
    models: [],
    modelPresets: [],
    modelId: '',
    needsConnection: true,
    connectionGuide: { message: '请先连接自己的 API' },
    modelListState: { phase: 'ready' },
    loadModels: vi.fn().mockResolvedValue({ success: true }),
    selectModel: vi.fn().mockResolvedValue({ success: true }),
    testModel: vi.fn().mockResolvedValue({ success: true }),
    recoverConnectionTest: vi.fn().mockResolvedValue({ success: true }),
    beginModelIntake: vi.fn(),
    loadModelDiscovery: vi
      .fn()
      .mockResolvedValue({ success: true, data: { models: [{ modelId: 'live-model', displayName: '实时型号' }] } }),
    removeModel: vi.fn().mockResolvedValue({ success: true }),
    recordContext() {
      return this.owner;
    },
    saveModel: vi.fn(async (profile) => {
      const old = harness.store.models.find((model) => model.id === profile.id);
      harness.store.models = [
        ...harness.store.models.filter((model) => model.id !== profile.id),
        {
          ...saved(profile.id),
          ...profile,
          apiKey: undefined,
          configured: Boolean(profile.apiKey || old?.configured),
          capabilities: { structured: profile.structured, stream: profile.stream }
        }
      ];
      return { success: true };
    })
  });
  wrapper = mount(Connectors, { global: { stubs: { BaseIcon: true, CustomModal: modal } } });
});
afterEach(() => wrapper?.unmount());
async function tap(label) {
  const node = wrapper.findAll('button').find((button) => button.text().trim() === label);
  expect(node, label).toBeTruthy();
  await node.trigger('tap');
  await flushPromises();
}
async function add(provider = 'deepseek') {
  await wrapper.get(`[data-provider-id="${provider}"] button`).trigger('tap');
  await flushPromises();
}
async function manage(id = 'one') {
  await wrapper.get(`[data-connection-id="${id}"] button`).trigger('tap');
  await flushPromises();
}

describe('BYOK two-step connector UI', () => {
  async function customFields(endpoint = 'https://model.example.com/v1/chat/completions') {
    await add('custom');
    await wrapper.get('input[aria-label="服务名称"]').setValue('  我的服务  ');
    await wrapper.get('input[aria-label="接口地址"]').setValue(endpoint);
    await wrapper.get('input[type="password"]').setValue('S51_SYNTHETIC_NOT_VALID');
  }
  it('S51 adds a named custom endpoint and requires the existing explicit live-model choice', async () => {
    await customFields();
    expect(wrapper.find('[data-provider-id="custom"]').text()).toContain('自定义服务');
    expect(harness.store.saveModel).not.toHaveBeenCalled();
    await tap('保存并读取型号');
    const first = harness.store.saveModel.mock.calls[0][0];
    expect(first).toMatchObject({
      provider: '我的服务',
      endpoint: 'https://model.example.com/v1/chat/completions',
      model: '',
      requiresModelSelection: true,
      apiKey: 'S51_SYNTHETIC_NOT_VALID'
    });
    expect(harness.store.saveModel.mock.calls[0][1]).toBe(true);
    expect(harness.store.loadModelDiscovery).toHaveBeenCalledExactlyOnceWith({ profileId: first.id, refresh: true });
    expect(harness.store.selectModel).not.toHaveBeenCalled();
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
    await wrapper.get('select').setValue('live-model');
    await tap('保存并使用');
    expect(harness.store.saveModel.mock.calls[1][0]).toMatchObject({
      id: first.id,
      provider: '我的服务',
      endpoint: first.endpoint,
      model: 'live-model',
      requiresModelSelection: false
    });
    expect(harness.store.saveModel.mock.calls[1][0]).not.toHaveProperty('apiKey');
    expect(harness.store.selectModel).toHaveBeenCalledExactlyOnceWith(first.id);
    expect(harness.store.beginModelIntake).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('S51_SYNTHETIC_NOT_VALID');
  });
  it.each([
    'http://model.example.com/v1/chat/completions',
    'https://user:password@model.example.com/v1/chat/completions',
    'https://model.example.com/v1/chat/completions?key=hidden',
    'https://model.example.com/v1/chat/completions#hidden',
    'https://model.example.com:8443/v1/chat/completions'
  ])('S51 rejects an unsafe custom address before sending a credential: %s', async (endpoint) => {
    await customFields(endpoint);
    await tap('保存并读取型号');
    expect(wrapper.get('input[aria-label="接口地址"]').attributes('aria-invalid')).toBe('true');
    expect(wrapper.text()).toContain('完整 HTTPS 接口地址');
    expect(harness.store.saveModel).not.toHaveBeenCalled();
    expect(harness.store.loadModelDiscovery).not.toHaveBeenCalled();
    expect(harness.store.selectModel).not.toHaveBeenCalled();
  });
  it('S51 completes only a known provider base and preserves a custom completion path', async () => {
    await customFields('  https://api.deepseek.com  ');
    await tap('保存并读取型号');
    expect(harness.store.saveModel.mock.calls[0][0].endpoint).toBe('https://api.deepseek.com/chat/completions');
  });
  it('S51 leaves forbidden endpoints to the existing server gate and never starts discovery or selection', async () => {
    harness.store.saveModel.mockResolvedValue({
      success: false,
      error: 'ENDPOINT_FORBIDDEN',
      message: 'unsafe vendor detail'
    });
    await customFields();
    await tap('保存并读取型号');
    expect(harness.store.saveModel).toHaveBeenCalledOnce();
    expect(harness.store.loadModelDiscovery).not.toHaveBeenCalled();
    expect(harness.store.selectModel).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain('模型地址未获服务端授权');
    expect(wrapper.text()).not.toContain('unsafe vendor detail');
    expect(wrapper.get('input[type="password"]').element.value).toBe('');
    expect(wrapper.get('input[aria-label="接口地址"]').element.value).toBe(
      'https://model.example.com/v1/chat/completions'
    );
  });
  it('S51 clears custom identity, endpoint and key drafts on account change and cancellation', async () => {
    await customFields();
    harness.store.owner = 'owner-b';
    await nextTick();
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
    expect(harness.store.saveModel).not.toHaveBeenCalled();
    await add('custom');
    expect(wrapper.get('input[aria-label="服务名称"]').element.value).toBe('');
    expect(wrapper.get('input[aria-label="接口地址"]').element.value).toBe('');
    expect(wrapper.get('input[type="password"]').element.value).toBe('');
    await wrapper.get('.test-close').trigger('click');
    await add('custom');
    expect(wrapper.get('input[aria-label="接口地址"]').element.value).toBe('');
    expect(harness.store.saveModel).not.toHaveBeenCalled();
  });
  it('S51 shows a saved custom address read-only while changing its model and retains its identity', async () => {
    harness.store.models = [
      saved('custom-one', { provider: '我的服务', endpoint: 'https://model.example.com/compatible/chat/completions' })
    ];
    await nextTick();
    await manage('custom-one');
    expect(wrapper.text()).toContain('https://model.example.com/compatible/chat/completions');
    expect(wrapper.find('input[aria-label="接口地址"]').exists()).toBe(false);
    await tap('换型号');
    await wrapper.get('select').setValue('live-model');
    await tap('保存型号');
    expect(harness.store.saveModel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'custom-one',
        provider: '我的服务',
        endpoint: 'https://model.example.com/compatible/chat/completions'
      }),
      true
    );
  });
  it('S51 never renders credentials or query parameters from an invalid legacy saved address', async () => {
    harness.store.models = [
      saved('custom-one', {
        provider: '我的服务',
        endpoint: 'https://user:legacy-secret@model.example.com/v1/chat/completions?key=legacy-secret'
      })
    ];
    await nextTick();
    await manage('custom-one');
    expect(wrapper.text()).toContain('接口地址暂不可读');
    expect(wrapper.text()).not.toContain('legacy-secret');
    expect(harness.store.saveModel).not.toHaveBeenCalled();
  });
  it('shows only the 13 release providers followed by the custom entry in the add list', () => {
    expect(wrapper.findAll('[data-provider-id]').map((row) => row.attributes('data-provider-id'))).toEqual([
      'deepseek',
      'siliconflow',
      'zhipu',
      'dashscope',
      'moonshot',
      'ark',
      'qianfan',
      'hunyuan',
      'minimax',
      'stepfun',
      'spark',
      'yi',
      'baichuan',
      'custom'
    ]);
  });
  it('shows multiple saved connections and filters platform models', async () => {
    harness.store.models = [
      saved(),
      saved('two', {
        provider: 'OpenRouter',
        model: 'exact-free-model',
        connectionStatus: 'failed',
        lastError: 'KEY_INVALID'
      }),
      { ...saved('platform'), source: 'platform' }
    ];
    harness.store.modelId = 'one';
    await nextTick();
    expect(wrapper.findAll('[data-connection-id]')).toHaveLength(2);
    expect(wrapper.text()).toContain('正在使用');
    expect(wrapper.text()).toContain('密钥无效');
    expect(wrapper.find('[data-connection-id="platform"]').exists()).toBe(false);
    expect(wrapper.find('[data-provider-id="openrouter"]').exists()).toBe(false);
  });
  it('keeps a saved Z.ai connection available for management', async () => {
    harness.store.models = [
      saved('legacy-zai', {
        provider: 'Z.ai',
        endpoint: 'https://api.z.ai/api/paas/v4/chat/completions',
        model: 'glm-4.5-flash'
      })
    ];
    await nextTick();
    expect(wrapper.get('[data-connection-id="legacy-zai"]').text()).toContain('glm-4.5-flash');
    await manage('legacy-zai');
    expect(wrapper.get('[role="dialog"]').text()).toContain('Z.ai');
  });
  it('saves a key before discovery, requires an explicit model choice and never starts inference on selection', async () => {
    await add();
    expect(wrapper.get('input[type="password"]').attributes('maxlength')).toBe(String(MODEL_API_KEY_MAX_LENGTH));
    expect(wrapper.get('input[type="password"]').attributes('autocomplete')).toBe('off');
    await wrapper.get('input[type="password"]').setValue('fixture-only-private-key');
    await tap('保存并读取型号');
    const first = harness.store.saveModel.mock.calls[0][0];
    expect(first).toMatchObject({ model: '', requiresModelSelection: true, apiKey: 'fixture-only-private-key' });
    expect(harness.store.loadModelDiscovery).toHaveBeenCalledExactlyOnceWith({ profileId: first.id, refresh: true });
    expect(harness.store.selectModel).not.toHaveBeenCalled();
    await wrapper.get('select').setValue('live-model');
    await tap('保存并使用');
    expect(harness.store.saveModel.mock.calls[1][0]).toMatchObject({
      model: 'live-model',
      requiresModelSelection: false
    });
    expect(harness.store.saveModel.mock.calls[1][0]).not.toHaveProperty('apiKey');
    expect(harness.store.selectModel).toHaveBeenCalledWith(first.id);
    expect(harness.store.beginModelIntake).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('fixture-only-private-key');
  });
  it('maps discovery failure into safe Chinese feedback and keeps manual model entry', async () => {
    harness.store.models = [saved()];
    harness.store.loadModelDiscovery.mockResolvedValue({
      success: false,
      errorCode: 'UNSUPPORTED_DISCOVERY',
      message: 'untrusted upstream text'
    });
    await nextTick();
    await manage();
    await tap('换型号');
    expect(wrapper.text()).toContain('请手填型号');
    expect(wrapper.text()).not.toContain('untrusted upstream text');
    const field = wrapper.findAllComponents(BaseInput).find((input) => input.props('label') === '手填型号');
    await field.vm.$emit('update:modelValue', 'manual-id');
    await tap('保存型号');
    expect(harness.store.saveModel).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'one', model: 'manual-id' }),
      true
    );
  });
  it('retains a saved key when the replacement field is blank and preserves capabilities', async () => {
    harness.store.models = [saved()];
    await nextTick();
    await manage();
    await tap('换密钥');
    await tap('保存密钥');
    expect(harness.store.saveModel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'one', apiKey: '', stream: false }),
      true
    );
    expect(harness.store.beginModelIntake).not.toHaveBeenCalled();
  });
  it('keeps testing and disconnecting explicit and displays safe failure actions', async () => {
    harness.store.models = [saved()];
    harness.store.testModel.mockResolvedValue({
      success: false,
      error: 'TIMEOUT',
      requestId: 'original-test-request',
      message: 'vendor message must not be rendered'
    });
    await nextTick();
    await manage();
    await tap('测试');
    expect(harness.store.testModel).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('请先查询原请求');
    expect(wrapper.text()).not.toContain('vendor message');
    await tap('查询原请求');
    expect(harness.store.testModel).toHaveBeenCalledOnce();
    expect(harness.store.recoverConnectionTest).toHaveBeenCalledWith('one', 'original-test-request');
    await wrapper.get('[aria-label="断开连接"]').trigger('tap');
    expect(wrapper.get('.disconnect-choices').attributes('aria-label')).toBe('断开此连接？');
    expect(harness.store.removeModel).not.toHaveBeenCalled();
    await tap('取消');
    expect(wrapper.find('.disconnect-choices').exists()).toBe(false);
    expect(harness.store.removeModel).not.toHaveBeenCalled();
    await wrapper.get('[aria-label="断开连接"]').trigger('tap');
    await tap('断开');
    expect(harness.store.removeModel).toHaveBeenCalledWith('one');
  });
  it('blocks connection changes while teaching is busy', async () => {
    harness.store.busy = true;
    await nextTick();
    expect(wrapper.get('[data-provider-id="deepseek"] button').attributes('disabled')).toBeDefined();
    expect(harness.store.saveModel).not.toHaveBeenCalled();
  });
  it('revokes the key draft on identity change and asks for login before accepting credentials', async () => {
    await add();
    await wrapper.get('input[type="password"]').setValue('fixture-only-private-key');
    harness.store.owner = 'owner-b';
    await nextTick();
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
    expect(harness.store.saveModel).not.toHaveBeenCalled();
    harness.token = '';
    await add();
    expect(wrapper.text()).toContain('登录后连接自己的 API');
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
  });
});
