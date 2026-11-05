import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import Control from '@/components/business/learning/muse-model-control.vue';
import Feedback from '@/components/business/learning/muse-model-feedback.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import BaseCheckbox from '@/components/base/base-checkbox/base-checkbox.vue';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as learningDomain from '../../laf-backend/functions/_shared/learning-domain.js';
import * as writingCoach from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import { INTAKE_CHOICES } from '../../laf-backend/functions/_shared/learning-intake.js';
import { coachFixture } from '../fixtures/writing-coach.js';
// Load the inert Node CLI with Node's loader rather than Vite's browser asset transform.
const { assertDevTest, cleanupOptions, readPrivateAccount, requireResult, verifyByokFrontend } = createRequire(
  import.meta.url
)('../../scripts/build/verify-byok-frontend.mjs');
const mock = vi.hoisted(() => ({ learning: null }));
vi.mock('@/stores/modules/conversation-learning.js', () => ({ useConversationLearningStore: () => mock.learning }));
let wrapper;
beforeEach(() => {
  setActivePinia(createPinia());
  mock.learning = reactive({
    busy: false,
    intakeBusy: false,
    modelId: 'one',
    sharingAllowed: true,
    needsConnection: false,
    models: [
      {
        id: 'one',
        provider: 'A',
        model: 'model-a',
        source: 'byok',
        configured: true,
        connectionStatus: 'connected',
        capabilityCheck: { version: 1, tools: true, structured: true, checkedAt: 1 }
      },
      {
        id: 'two',
        provider: 'B',
        model: 'model-b',
        source: 'byok',
        configured: true,
        connectionStatus: 'connected',
        capabilityCheck: { version: 1, tools: true, structured: true, checkedAt: 1 }
      },
      { id: 'platform', provider: 'Platform', model: 'platform-model', source: 'platform', configured: true }
    ],
    selectModel: vi.fn().mockResolvedValue({ success: true }),
    setSharingAllowed: vi.fn().mockResolvedValue({ success: true }),
    recordContext: () => 'fixture-owner'
  });
});
afterEach(() => wrapper?.unmount());
it('shows the current provider/model and switches only through the saved connection action', async () => {
  wrapper = mount(Control);
  expect(wrapper.text()).toContain('A · model-a');
  expect(wrapper.getComponent(BaseInput).props('options')).toHaveLength(2);
  await wrapper.get('select').setValue('two');
  await flushPromises();
  expect(mock.learning.selectModel).toHaveBeenCalledExactlyOnceWith('two');
  expect(mock.learning.modelId).toBe('one');
});
it('restores the sharing checkbox and persists explicit changes through its Store action', async () => {
  wrapper = mount(Control);
  expect(wrapper.getComponent(BaseCheckbox).props('modelValue')).toBe(true);
  wrapper.getComponent(BaseCheckbox).vm.$emit('update:modelValue', false);
  await flushPromises();
  expect(mock.learning.setSharingAllowed).toHaveBeenCalledExactlyOnceWith(false);
});
it('disables switching while busy and offers a connector entry for an unavailable model', async () => {
  mock.learning.busy = true;
  mock.learning.models[0].connectionStatus = 'failed';
  mock.learning.models[0].lastError = 'MODEL_UNAVAILABLE';
  wrapper = mount(Control);
  expect(wrapper.get('select').attributes('disabled')).toBeDefined();
  expect(wrapper.text()).toContain('型号不存在或已下线');
  mock.learning.busy = false;
  await nextTick();
  await wrapper
    .findAll('button')
    .find((button) => button.text().trim() === 'AI 连接器')
    .trigger('tap');
  expect(wrapper.emitted('connect')).toHaveLength(1);
});
it('does not present unselected models as usable choices', () => {
  mock.learning.models[1].requiresModelSelection = true;
  wrapper = mount(Control);
  expect(
    wrapper
      .getComponent(BaseInput)
      .props('options')
      .map((option) => option.value)
  ).toEqual(['one']);
});
it.each([
  ['NEEDS_CONNECTION', '打开 AI 连接器', 'open_connectors'],
  ['TIMEOUT', '查询原请求', 'query_result'],
  ['COACH_INVALID', '重新评估', 'retry'],
  ['UNSUPPORTED_DISCOVERY', '手填型号', 'manual_model']
])('maps %s into safe text and a working action', async (error, label, type) => {
  wrapper = mount(Feedback, { props: { failure: { error, message: 'untrusted provider response' } } });
  expect(wrapper.text()).not.toContain('untrusted provider response');
  if (error === 'NEEDS_CONNECTION') expect(wrapper.attributes('role')).toBe('status');
  await wrapper.find('button').trigger('tap');
  expect(wrapper.get('button').text().trim()).toBe(label);
  expect(wrapper.emitted('action')[0][0]).toMatchObject({ type });
});
it('shows running, success and failure feedback without exposing raw response text', async () => {
  wrapper = mount(Feedback, { props: { state: { phase: 'running' } } });
  expect(wrapper.text()).toContain('正在处理');
  await wrapper.setProps({ state: { phase: 'succeeded' } });
  expect(wrapper.text()).toContain('已收到结果');
  await wrapper.setProps({ state: { phase: 'failed', errorCode: 'KEY_INVALID' } });
  expect(wrapper.text()).toContain('密钥无效');
});

describe('BYOK verification script with an in-memory transport only', () => {
  const env = {
    NODE_ENV: 'test',
    YOZI_BUILD_CHANNEL: 'test',
    HOST: '127.0.0.1',
    DB_NAME: 'yozi_dev_test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/yozi_dev_test',
    PORT: '4382'
  };
  const credentials = { userId: 'fixture-user', token: 'private-unit-test-token' };
  const missing = { code: 404, success: false, error: 'ACCOUNT_NOT_FOUND' };
  const emptyUsage = { code: 0, success: true, data: { calls: [] } };
  const deleted = { code: 0, success: true, data: { deleted: true, billingRetained: true } };
  const cleanupArgs = ['--cleanup-orphans'];
  const oneOrphan = [...cleanupArgs, '--orphan-ms-start', '1793033351001', '--orphan-ms-end', '1793033351001'];

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('REAL_NETWORK_FORBIDDEN_IN_UNIT_TEST');
      })
    );
  });
  afterEach(() => {
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  function transport(handler) {
    return vi.fn(async (url, options) => {
      const path = new URL(url).pathname.slice(1);
      const body = options.body ? JSON.parse(options.body) : undefined;
      const result = handler(path, body, options);
      if (result instanceof Error) throw result;
      if (result?.invalidJson)
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError();
          }
        };
      if (result === undefined) throw Object.assign(new Error(), { code: 'UNEXPECTED_STUB_REQUEST' });
      return {
        ok: result.code === undefined || result.code < 400,
        status: result.code >= 400 ? result.code : 200,
        json: async () => result
      };
    });
  }
  const run = (fetchImpl, args = []) => verifyByokFrontend({ env, args, fetchImpl });
  const requests = (fetchImpl, path) =>
    fetchImpl.mock.calls
      .filter(([url]) => new URL(url).pathname === `/${path}`)
      .map(([, options]) => ({ ...options, body: options.body ? JSON.parse(options.body) : undefined }));
  function registrationTransport(overrides = {}) {
    return transport((path, body, options) => {
      if (overrides[path]) return overrides[path](body, options);
      if (path === 'health') return { status: 'ok' };
      if (path === 'login') return body.email.startsWith('codex.byok.') ? { code: 0, data: credentials } : missing;
      if (path === 'learning-models')
        return body.action === 'usage' ? emptyUsage : { code: 0, success: true, data: { needsConnection: false } };
      if (path === 'account-delete') return deleted;
    });
  }

  // Fixtures checked against login.ts; learning-models.ts (including model-discovery.ts),
  // proxy-ai.ts, learning-sync.ts, learning-compute.ts and account-delete.ts.
  it.each([
    ['login', { code: 0, data: credentials }],
    ['learning-models:list', { code: 0, success: true, data: { models: [], needsConnection: true } }],
    ['learning-models:discover', { code: 0, success: true, data: { models: [] } }],
    ['learning-models:preferences', { code: 0, success: true, data: { selectedModelId: 'fixture' } }],
    ['learning-models:save', { code: 0, success: true, data: { id: 'fixture', keySaved: true } }],
    ['learning-models:delete', { code: 0, success: true, data: { removed: true } }],
    ['learning-models:usage', emptyUsage],
    ['learning-models:test', { code: 0, success: true, data: { requestId: 'fixture-request' } }],
    ['learning-models:result', { code: 0, success: true, data: { requestId: 'fixture-request' }, reused: true }],
    ['proxy-ai', { code: 0, success: true, data: { requestId: 'fixture-request', requestBinding: 'fixture-binding' } }],
    ['learning-sync:push', { code: 0, success: true, data: { revision: 1 } }],
    ['learning-compute', { code: 0, success: true, data: { gradingAuthority: false, persisted: false } }],
    ['account-delete:request', deleted],
    ['success-only envelope', { success: true, data: { value: 'fixture' } }]
  ])('accepts the verified success envelope for %s without changing its data', (endpoint, result) => {
    expect(requireResult(result, endpoint)).toBe(result.data);
  });

  it.each([
    [{ code: 503, success: false, errorCode: 'DISCOVERY_DISABLED' }, 'DISCOVERY_DISABLED(code=503)'],
    [{ code: 429, success: false }, '429(code=429)'],
    [{ code: 0, success: false }, 'SUCCESS_FALSE(code=0)'],
    [{ code: 503, success: true }, '503(code=503)'],
    [{ code: '0' }, '0(code=0)'],
    [{}, 'INVALID_RESPONSE'],
    [null, 'INVALID_RESPONSE']
  ])('rejects unsuccessful or conflicting envelopes with endpoint and code: %j', (result, reason) => {
    expect(() => requireResult(result, 'learning-models:discover')).toThrow(
      `QA_STEP_FAILED:learning-models:discover:${reason}`
    );
    try {
      requireResult(result, 'learning-models:discover');
    } catch (error) {
      expect(error.code).toBe('QA_STEP_FAILED');
      expect(error.code).not.toBe('ERR_ASSERTION');
    }
  });
  it('never includes raw provider text or secrets in a failure reason', () => {
    expect(() => requireResult({ success: false, code: 503, error: 'Bearer secret-provider-key' }, 'proxy-ai')).toThrow(
      'QA_STEP_FAILED:proxy-ai:INVALID_RESPONSE(code=503)'
    );
  });

  it.each([
    ['NODE_ENV', 'production'],
    ['YOZI_BUILD_CHANNEL', 'release'],
    ['HOST', '0.0.0.0'],
    ['DB_NAME', 'yozi'],
    ['MONGODB_URI', 'mongodb://remote.example/yozi_dev_test'],
    ['MONGODB_URI', 'mongodb://127.0.0.1/yozi'],
    ['PORT', '4383']
  ])('refuses non-isolated %s before any request', async (key, value) => {
    const fetchImpl = vi.fn();
    await expect(verifyByokFrontend({ env: { ...env, [key]: value }, args: cleanupArgs, fetchImpl })).rejects.toThrow(
      'DEV_TEST_ONLY'
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('accepts the explicitly isolated dev environment too', () => {
    expect(() => assertDevTest({ ...env, NODE_ENV: 'development', YOZI_BUILD_CHANNEL: 'dev' })).not.toThrow();
  });
  it.each([
    ['--orphan-ms-start', '1793033351000'],
    [...cleanupArgs, '--orphan-ms-start', '1793033350999'],
    [...cleanupArgs, '--orphan-ms-end', '1793033351413'],
    [...cleanupArgs, '--orphan-ms-start', '1793033351002', '--orphan-ms-end', '1793033351001'],
    [...cleanupArgs, '--orphan-ms-start', '1793033351000.5'],
    [...cleanupArgs, '--orphan-ms-start', 'not-a-number'],
    ['--unknown-cleanup']
  ])('refuses out-of-scope or incomplete cleanup arguments before network: %j', async (...args) => {
    const fetchImpl = vi.fn();
    await expect(verifyByokFrontend({ env, args, fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts code-zero login and cleans up when a later response validation fails', async () => {
    const fetchImpl = registrationTransport();
    const report = await run(fetchImpl);
    expect(report.registration).toBe('confirmed');
    expect(report.steps.register).toMatchObject({
      status: 'failed',
      reason: 'QA_STEP_FAILED:learning-models:list:EXPECTED_EMPTY_CONNECTIONS'
    });
    expect(report.blocked).toEqual([]);
    expect(report.cleanupAttempted).toBe(true);
    expect(report.steps.delete_new_account).toMatchObject({ status: 'passed', billingRetained: true });
    expect(requests(fetchImpl, 'account-delete')).toHaveLength(1);
    expect(requests(fetchImpl, 'account-delete')[0].headers.Authorization).toBe(`Bearer ${credentials.token}`);
    expect(JSON.stringify(report)).not.toContain(credentials.token);
    expect(JSON.stringify(report)).not.toContain(requests(fetchImpl, 'login')[0].body.password);
  });
  it('retains a returned cleanup token even when the login envelope indicates failure', async () => {
    const fetchImpl = registrationTransport({
      login: (body) =>
        body.existingAccountOnly
          ? missing
          : { code: 503, success: false, error: 'SESSION_WRITE_FAILED', data: credentials }
    });
    const report = await run(fetchImpl);
    expect(report.steps.register.reason).toBe('QA_STEP_FAILED:login:SESSION_WRITE_FAILED(code=503)');
    expect(report.registration).toBe('possibly_created');
    expect(report.steps.delete_new_account.status).toBe('passed');
    expect(report.blocked).toEqual([]);
  });
  it.each(['invalid-data', 'invalid-json', 'timeout', 'server-error'])(
    'recovers a possibly-created account through existing-only login after %s',
    async (failure) => {
      const fetchImpl = registrationTransport({
        login: (body) => {
          if (!body.email.startsWith('codex.byok.')) return missing;
          if (body.existingAccountOnly) return { code: 0, data: credentials };
          return {
            'invalid-data': { code: 0, data: { userId: credentials.userId } },
            'invalid-json': { invalidJson: true },
            timeout: Object.assign(new Error(), { code: 'ETIMEDOUT' }),
            'server-error': { code: 500, success: false, error: 'LOGIN_FAILED' }
          }[failure];
        }
      });
      const report = await run(fetchImpl);
      const logins = requests(fetchImpl, 'login').filter((entry) => entry.body.email.startsWith('codex.byok.'));
      expect(logins).toHaveLength(2);
      expect(logins[0].body.existingAccountOnly).toBeUndefined();
      expect(logins[1].body).toMatchObject({
        email: logins[0].body.email,
        existingAccountOnly: true,
        verifyCode: '000000'
      });
      expect(logins[1].body.password).toBeUndefined();
      expect(report.cleanupAttempted).toBe(true);
      expect(report.steps.delete_new_account.status).toBe('passed');
      expect(report.steps.register.status).toBe('failed');
      if (failure === 'timeout')
        expect(report.blocked).toMatchObject([{ step: 'local_QA_access', endpoint: 'login', reason: 'ETIMEDOUT' }]);
      else {
        expect(report.blocked).toEqual([]);
        expect(report.steps.register.reason).toMatch(/^QA_STEP_FAILED:login:/);
      }
    }
  );
  it('confirms absence without ever registering again after a failed login', async () => {
    const fetchImpl = registrationTransport({
      login: (body) => (body.existingAccountOnly ? missing : { code: 400, success: false, error: 'INPUT_INVALID' })
    });
    const report = await run(fetchImpl);
    expect(report.steps.delete_new_account).toEqual({ status: 'passed', absent: true });
    expect(requests(fetchImpl, 'account-delete')).toHaveLength(0);
    expect(report.steps.register.reason).toBe('QA_STEP_FAILED:login:INPUT_INVALID(code=400)');
    expect(report.blocked).toEqual([]);
  });
  it('records an actual health transport refusal without attempting login or cleanup', async () => {
    const fetchImpl = transport(() => Object.assign(new Error(), { code: 'EPERM' }));
    const report = await run(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(report.steps.register).toEqual({ status: 'unverified', reason: 'EPERM' });
    expect(report.blocked).toEqual([{ step: 'local_QA_access', endpoint: 'health', reason: 'EPERM' }]);
    expect(report.cleanupAttempted).toBeUndefined();
  });
  it('retains accounts with reserved calls and records unknown costs as unknown', async () => {
    const fetchImpl = registrationTransport({
      'learning-models': (body) =>
        body.action === 'usage'
          ? { code: 0, success: true, data: { calls: [{ source: 'byok', status: 'reserved', actualCost: null }] } }
          : { code: 0, data: { needsConnection: false } }
    });
    const report = await run(fetchImpl);
    expect(report.steps.delete_new_account).toMatchObject({
      status: 'unverified',
      reason: 'REQUEST_PENDING; account retained'
    });
    expect(requests(fetchImpl, 'account-delete')).toHaveLength(0);
    expect(report).toMatchObject({ actualCost: null, pendingCosts: 1 });
  });
  it('does not delete or claim zero costs when usage cannot be confirmed', async () => {
    const fetchImpl = registrationTransport({
      'learning-models': () => ({ code: 503, success: false, error: 'USAGE_UNAVAILABLE' })
    });
    const report = await run(fetchImpl);
    expect(report.steps.delete_new_account.reason).toBe(
      'QA_STEP_FAILED:learning-models:usage:USAGE_UNAVAILABLE(code=503)'
    );
    expect(report).toMatchObject({ calls: null, actualCost: null, pendingCosts: null });
    expect(requests(fetchImpl, 'account-delete')).toHaveLength(0);
  });
  it.each([
    [{ code: 0, data: { deleted: false, billingRetained: true } }, 'TEST_ACCOUNT_DELETE_NOT_CONFIRMED'],
    [{ code: 0, data: { deleted: true, billingRetained: false } }, 'BILLING_RETENTION_NOT_CONFIRMED'],
    [{ code: 503, success: false, error: 'PURGE_FAILED' }, 'PURGE_FAILED(code=503)']
  ])('reports unconfirmed deletion with the precise interface and error code', async (response, reason) => {
    const fetchImpl = registrationTransport({ 'account-delete': () => response });
    const report = await run(fetchImpl);
    expect(report.steps.delete_new_account).toMatchObject({
      status: 'unverified',
      reason: `QA_STEP_FAILED:account-delete:request:${reason}`
    });
    expect(report.calls).toBe(0);
    expect(requests(fetchImpl, 'account-delete')).toHaveLength(1);
  });

  it('cleans the inclusive authorized orphan window only, using existing-only login and retained billing', async () => {
    const survivors = new Set(['codex.byok.1793033351001@example.test']);
    const fetchImpl = transport((path, body) => {
      if (path === 'health') return { status: 'ok' };
      if (path === 'login') return survivors.has(body.email) ? { code: 0, data: credentials } : missing;
      if (path === 'learning-models' && body.action === 'usage') return emptyUsage;
      if (path === 'account-delete') {
        survivors.clear();
        return deleted;
      }
    });
    expect(cleanupOptions(cleanupArgs)).toEqual({ start: 1793033351000, end: 1793033351412 });
    const report = await run(fetchImpl, cleanupArgs);
    expect(report.steps).toEqual({ cleanup_orphans: { status: 'passed', checked: 413, deleted: 1, absent: 412 } });
    const logins = requests(fetchImpl, 'login');
    expect(logins).toHaveLength(413);
    expect(logins[0].body.email).toBe('codex.byok.1793033351000@example.test');
    expect(logins.at(-1).body.email).toBe('codex.byok.1793033351412@example.test');
    for (const { body } of logins) {
      expect(body).toMatchObject({ existingAccountOnly: true, verifyCode: '000000' });
      expect(body.password).toBeUndefined();
    }
    expect(report.orphanCleanup[1]).toMatchObject({
      status: 'passed',
      billingRetained: true,
      receipt: { calls: 0, actualCost: 0, pendingCosts: 0 }
    });
    expect([...new Set(fetchImpl.mock.calls.map(([url]) => new URL(url).pathname))]).toEqual([
      '/health',
      '/login',
      '/learning-models',
      '/account-delete'
    ]);
    expect(JSON.stringify(report)).not.toContain(credentials.token);
    const repeated = await run(fetchImpl, oneOrphan);
    expect(repeated.steps.cleanup_orphans).toMatchObject({ status: 'passed', deleted: 0, absent: 1 });
    expect(requests(fetchImpl, 'account-delete')).toHaveLength(1);
  });
  it('keeps an orphan with in-flight requests and never runs seed or inference', async () => {
    const fetchImpl = transport((path, body) => {
      if (path === 'health') return { status: 'ok' };
      if (path === 'login') return { code: 0, data: credentials };
      if (path === 'learning-models' && body.action === 'usage')
        return { code: 0, data: { calls: [{ status: 'reserved', actualCost: null }] } };
    });
    const report = await run(fetchImpl, oneOrphan);
    expect(report.steps.cleanup_orphans.status).toBe('unverified');
    expect(report.orphanCleanup[0]).toMatchObject({
      status: 'unverified',
      reason: 'REQUEST_PENDING; account retained'
    });
    expect(requests(fetchImpl, 'account-delete')).toHaveLength(0);
  });
  it('stops orphan cleanup on an API error and identifies the exact failed account and step', async () => {
    const fetchImpl = transport((path) =>
      path === 'health' ? { status: 'ok' } : { code: 503, success: false, error: 'LOGIN_FAILED' }
    );
    const report = await run(fetchImpl, cleanupArgs);
    expect(report.steps.cleanup_orphans).toEqual({
      status: 'unverified',
      reason: 'QA_STEP_FAILED:login:LOGIN_FAILED(code=503)'
    });
    expect(report.orphanCleanup).toEqual([
      {
        syntheticAccount: 'codex.byok.1793033351000@example.test',
        status: 'unverified',
        reason: 'QA_STEP_FAILED:login:LOGIN_FAILED(code=503)'
      }
    ]);
    expect(report.blocked).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('reads only a small private regular account file and rejects exposed or linked credentials', () => {
    const directory = mkdtempSync(join(tmpdir(), 'yozi-private-account-unit-'));
    const file = join(directory, 'account.json'),
      link = join(directory, 'link.json');
    try {
      writeFileSync(file, JSON.stringify({ email: 'ui.fixture@example.test', password: 'unit-only-password' }), {
        mode: 0o600
      });
      expect(readPrivateAccount(file).email).toBe('ui.fixture@example.test');
      chmodSync(file, 0o644);
      expect(() => readPrivateAccount(file)).toThrow();
      chmodSync(file, 0o600);
      symlinkSync(file, link);
      expect(() => readPrivateAccount(link)).toThrow();
      writeFileSync(file, 'x'.repeat(16385));
      expect(() => readPrivateAccount(file)).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.each([
    ['--cleanup-account-file', 'fixture.json', '--cleanup-orphans'],
    ['--cleanup-account-file', 'fixture.json', '--orphan-ms-start', '1793033351000'],
    ['--cleanup-account-file', '']
  ])('refuses conflicting cleanup modes before any request: %j', async (...args) => {
    const fetchImpl = vi.fn();
    await expect(verifyByokFrontend({ env, args, fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('cleans only the supplied UI account through password login and normal deletion', async () => {
    const account = { email: 'ui.fixture@example.test', password: 'unit-only-password' };
    const readAccount = vi.fn(() => account);
    const fetchImpl = registrationTransport({ login: () => ({ code: 0, data: credentials }) });
    const report = await verifyByokFrontend({
      env,
      args: ['--cleanup-account-file', 'fixture.json'],
      readAccount,
      fetchImpl
    });
    expect(report.mode).toBe('cleanup-account-file');
    expect(report.steps).toEqual({
      cleanup_ui_account: {
        status: 'passed',
        billingRetained: true,
        receipt: { calls: 0, pendingCosts: 0, actualCost: 0 }
      }
    });
    expect(requests(fetchImpl, 'login')).toHaveLength(1);
    expect(requests(fetchImpl, 'login')[0].body).toMatchObject({ ...account, existingAccountOnly: true });
    expect(requests(fetchImpl, 'login')[0].body.verifyCode).toBeUndefined();
    expect(requests(fetchImpl, 'account-delete')).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain(account.password);
    expect(JSON.stringify(report)).not.toContain(credentials.token);
    expect(readAccount).toHaveBeenCalledTimes(1);
  });
  it('does not create a UI account that has already been deleted', async () => {
    const fetchImpl = registrationTransport({ login: () => missing });
    const report = await verifyByokFrontend({
      env,
      args: ['--cleanup-account-file', 'fixture.json'],
      readAccount: () => ({ email: 'ui.fixture@example.test', password: 'unit-only-password' }),
      fetchImpl
    });
    expect(report.steps.cleanup_ui_account).toEqual({ status: 'passed', absent: true });
    expect(requests(fetchImpl, 'account-delete')).toHaveLength(0);
    expect(requests(fetchImpl, 'learning-models')).toHaveLength(0);
  });
  it('retains a UI account with in-flight requests and its pending-cost receipt', async () => {
    const fetchImpl = registrationTransport({
      login: () => ({ code: 0, data: credentials }),
      'learning-models': () => ({ code: 0, data: { calls: [{ status: 'reserved', actualCost: null }] } })
    });
    const report = await verifyByokFrontend({
      env,
      args: ['--cleanup-account-file', 'fixture.json'],
      readAccount: () => ({ email: 'ui.fixture@example.test', password: 'unit-only-password' }),
      fetchImpl
    });
    expect(report.steps.cleanup_ui_account).toMatchObject({
      status: 'unverified',
      reason: 'REQUEST_PENDING; account retained',
      receipt: { pendingCosts: 1, actualCost: null }
    });
    expect(requests(fetchImpl, 'account-delete')).toHaveLength(0);
  });
  it('preserves the prior fee receipt even when deletion is not confirmed', async () => {
    const fetchImpl = registrationTransport({
      login: () => ({ code: 0, data: credentials }),
      'account-delete': () => ({ code: 503, success: false, error: 'PURGE_FAILED' }),
      'learning-models': () => ({ code: 0, data: { calls: [{ status: 'failed', actualCost: null }] } })
    });
    const report = await verifyByokFrontend({
      env,
      args: ['--cleanup-account-file', 'fixture.json'],
      readAccount: () => ({ email: 'ui.fixture@example.test', password: 'unit-only-password' }),
      fetchImpl
    });
    expect(report.steps.cleanup_ui_account).toMatchObject({
      status: 'unverified',
      reason: 'QA_STEP_FAILED:account-delete:request:PURGE_FAILED(code=503)',
      receipt: { calls: 1, pendingCosts: 1, actualCost: null }
    });
  });
  it('refuses an unsafe account file before the health probe', async () => {
    const fetchImpl = vi.fn();
    const report = await verifyByokFrontend({
      env,
      args: ['--cleanup-account-file', 'fixture.json'],
      readAccount: () => {
        throw Object.assign(new Error(), { code: 'PRIVATE_ACCOUNT_FILE_REQUIRED' });
      },
      fetchImpl
    });
    expect(report.steps.cleanup_ui_account.reason).toBe('PRIVATE_ACCOUNT_FILE_REQUIRED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('accepts two successful alternative seed providers without a Z.ai profile', async () => {
    const connections = [
      { id: 'dev-openrouter-byok', providerId: 'openrouter', model: 'fixture-free-a' },
      { id: 'dev-zhipu-byok', providerId: 'zhipu', model: 'fixture-free-b' }
    ];
    let lists = 0;
    const fetchImpl = registrationTransport({
      'learning-models': (body) => {
        if (body.action === 'usage') return emptyUsage;
        if (body.action === 'list')
          return {
            code: 0,
            data:
              ++lists === 1
                ? { needsConnection: true }
                : { models: connections.map((item) => ({ ...item, source: 'byok', configured: true })) }
          };
        return { code: 503, success: false, error: 'DISCOVERY_DISABLED' };
      }
    });
    const seeded = {
      success: true,
      connections,
      selectedModelId: 'dev-zhipu-byok',
      attempts: [{ providerId: 'zai', classification: 'RATE_LIMITED' }]
    };
    const report = await verifyByokFrontend({ env, fetchImpl, seedModels: async () => seeded });
    expect(report.steps.two_connections.status).toBe('passed');
    expect(report.steps.discovery_and_switch.reason).toBe(
      'QA_STEP_FAILED:learning-models:discover:DISCOVERY_DISABLED(code=503)'
    );
    expect(report.seed).toEqual(seeded);
    expect(
      requests(fetchImpl, 'learning-models').find((entry) => entry.body.action === 'discover').body.profileId
    ).toBe('dev-openrouter-byok');
    expect(report.steps.delete_new_account.status).toBe('passed');
  });

  function completeFlow({
    failOperation,
    pendingCost = false,
    singleConnection = false,
    missingListedModel = false
  } = {}) {
    const connections = [
      { id: 'dev-openrouter-byok', providerId: 'openrouter', model: 'fixture-free-a' },
      { id: 'dev-agnes-byok', providerId: 'agnes', model: 'agnes-2.5-flash' }
    ];
    const models = connections.map((item) => ({ ...item, source: 'byok', configured: true }));
    const preferences = {};
    const calls = [];
    const operations = [];
    let seeded = false;
    const fetchImpl = transport((path, body) => {
      if (path === 'health') return { status: 'ok' };
      if (path === 'login') return body.email.startsWith('codex.byok.') ? { code: 0, data: credentials } : missing;
      if (path === 'account-delete') return deleted;
      if (path === 'learning-sync') {
        // Replay the actual submitted operations through the real domain, rather than accepting arbitrary writes.
        let state = learningDomain.emptyLearningState(credentials.userId, body.timezone);
        for (const operation of body.operations) state = learningDomain.applyLearningOperation(state, operation).state;
        expect(state.conversations[0].coach.days[0].completed).toBe(true);
        return { code: 0, data: { accepted: body.operations.map((operation) => operation.id), revision: 1 } };
      }
      if (path === 'proxy-ai') {
        calls.push({ source: 'byok', status: 'completed', executionStage: 'received', actualCost: 0 });
        const request = body.learningContext.coach;
        const coach = coachFixture(request);
        if (request.phase === 'daily') coach.cards.forEach((card, index) => (card.id = `c${index + 1}`));
        if (request.phase === 'summary') coach.learned = ['练习了邀请信写作'];
        return {
          code: 0,
          data: { requestId: body.requestId, requestBinding: body.requestBinding, modelId: body.modelId, coach }
        };
      }
      if (path !== 'learning-models') return;
      if (body.action === 'list')
        return { code: 0, data: { needsConnection: !seeded, models: seeded ? models : [], preferences } };
      if (body.action === 'discover')
        return {
          code: 0,
          data: {
            models: missingListedModel ? [] : [{ modelId: models.find((item) => item.id === body.profileId).model }]
          }
        };
      if (body.action === 'preferences') {
        Object.assign(preferences, body.preferences);
        return { code: 0, data: preferences };
      }
      if (body.action === 'usage') return { code: 0, data: { calls } };
      if (body.action === 'save') return { code: 0, data: { keySaved: true } };
      if (body.action === 'delete') return { code: 0, data: { removed: true } };
      if (body.action === 'test' && body.modelId === 'invalid-key-probe')
        return { code: 401, success: false, connectionError: 'KEY_INVALID' };
      if (body.action === 'test') {
        calls.push({ source: 'byok', status: 'completed', executionStage: 'received', actualCost: 0 });
        const profile = body.intake.turns.length
          ? {
              goal: body.intake.turns[0].answer,
              category: 'kaoyan',
              subjects: ['考研英语二写作'],
              exam: 'english2',
              minutes: 25,
              deadline: null,
              foundation: '能写简单的英文句子'
            }
          : null;
        return {
          code: 0,
          data: {
            message: profile ? '确认学习档案。' : '你在准备什么？',
            question: null,
            tools: [],
            intake: { options: profile ? [] : INTAKE_CHOICES, input: !profile, profile }
          }
        };
      }
    });
    return {
      fetchImpl,
      operations,
      args: {
        env,
        fetchImpl,
        seedModels: async () => {
          seeded = true;
          calls.push({ source: 'byok', status: 'completed', actualCost: 0 });
          calls.push({ source: 'byok', status: 'completed', actualCost: pendingCost ? null : 0 });
          return singleConnection
            ? { success: false, error: 'INSUFFICIENT_FREE_PROVIDERS', connections: connections.slice(1) }
            : { success: true, connections, selectedModelId: models[0].id };
        },
        loadDomain: async (file) =>
          file === 'learning-writing-coach.js'
            ? writingCoach
            : {
                ...learningDomain,
                applyLearningOperation: (state, operation) => {
                  operations.push(operation);
                  if (operation.type === failOperation)
                    throw Object.assign(new Error('private failure text'), { code: 'EXPLICIT_REQUIRED' });
                  return learningDomain.applyLearningOperation(state, operation);
                }
              }
      }
    };
  }

  it.each([false, true])(
    'completes every remaining step with real domain replay; pending cost=%s',
    async (pendingCost) => {
      const flow = completeFlow({ pendingCost });
      const report = await verifyByokFrontend(flow.args);
      expect(report.steps).toEqual(
        expect.objectContaining(
          Object.fromEntries(
            ['diagnostic', 'daily', 'writing', 'summary', 'relogin_restore', 'invalid_key', 'delete_new_account'].map(
              (name) => [name, expect.objectContaining({ status: 'passed' })]
            )
          )
        )
      );
      expect(Object.values(report.steps).every((step) => step.status === 'passed')).toBe(true);
      for (const operation of flow.operations.filter((operation) => operation.type.startsWith('coach.')))
        expect(operation.data.explicit, operation.type).toBe(true);
      expect(flow.operations.filter((operation) => operation.type === 'coach.paragraph')).toHaveLength(4);
      expect(requests(flow.fetchImpl, 'learning-sync')).toHaveLength(1);
      expect(requests(flow.fetchImpl, 'login').filter((entry) => entry.body.password)).toHaveLength(2);
      expect(
        requests(flow.fetchImpl, 'learning-models').filter((entry) => entry.body.action === 'delete')
      ).toHaveLength(1);
      expect(report).toMatchObject({ actualCost: pendingCost ? null : 0, pendingCosts: pendingCost ? 1 : 0 });
      expect(report.blocked).toEqual([]);
      expect(JSON.stringify(report)).not.toContain(credentials.token);
      expect(JSON.stringify(report)).not.toContain(requests(flow.fetchImpl, 'login')[0].body.password);
    }
  );

  it('only explicitly continues independent learning checks with one free connection, never passing the two-provider gate', async () => {
    const strict = completeFlow({ singleConnection: true });
    const stopped = await verifyByokFrontend(strict.args);
    expect(stopped.steps.two_connections.status).toBe('failed');
    expect(stopped.steps.intake.status).toBe('unverified');
    const flow = completeFlow({ singleConnection: true });
    const report = await verifyByokFrontend({ ...flow.args, continueIndependentChecks: true });
    expect(report.verificationMode).toBe('single-free-connection-learning');
    expect(report.steps.two_connections.status).toBe('failed');
    expect(report.steps.discovery_and_switch.status).toBe('unverified');
    for (const name of [
      'intake',
      'diagnostic',
      'daily',
      'writing',
      'summary',
      'relogin_restore',
      'invalid_key',
      'delete_new_account'
    ])
      expect(report.steps[name].status, name).toBe('passed');
    expect(requests(flow.fetchImpl, 'proxy-ai').every((request) => request.body.modelId === 'dev-agnes-byok')).toBe(
      true
    );
  });

  it('keeps an unlisted-model discovery failure visible while explicitly checking independent learning steps', async () => {
    const strict = completeFlow({ missingListedModel: true });
    const stopped = await verifyByokFrontend(strict.args);
    expect(stopped.steps.discovery_and_switch.status).toBe('failed');
    expect(stopped.steps.intake.status).toBe('unverified');
    const flow = completeFlow({ missingListedModel: true });
    const report = await verifyByokFrontend({ ...flow.args, continueIndependentChecks: true });
    expect(report.steps.discovery_and_switch.status).toBe('failed');
    expect(report.steps.summary.status).toBe('passed');
    expect(report.steps.delete_new_account.status).toBe('passed');
  });

  it('reports the exact failed local operation and still cleans its account', async () => {
    const flow = completeFlow({ failOperation: 'coach.answer' });
    const report = await verifyByokFrontend(flow.args);
    expect(report.steps.diagnostic).toEqual({
      status: 'failed',
      reason: 'QA_STEP_FAILED:learning-domain:coach.answer:EXPLICIT_REQUIRED'
    });
    expect(report.steps.delete_new_account.status).toBe('passed');
    expect(report.steps.daily.status).toBe('unverified');
    expect(JSON.stringify(report)).not.toContain('private failure text');
  });
});

it('S54 shows partial AI analysis only after an explicit receipt toggle and keeps unqueried work unverified', async () => {
  const workflow = {
    version: 1,
    parentId: 's54-receipt',
    status: 'incomplete',
    tasks: [
      { id: 'a', title: '核对A', status: 'completed', message: '原分析 <img src=x> 不作为工具。' },
      { id: 'b', title: '核对B', status: 'failed', errorCode: 'WORKFLOW_INVALID' },
      { id: 'c', title: '比较', status: 'unchecked' }
    ],
    final: { status: 'unchecked' }
  };
  wrapper = mount(Feedback, { props: { failure: { error: 'WORKFLOW_INVALID' }, workflow } });
  expect(wrapper.find('[data-test="workflow-receipt"]').exists()).toBe(false);
  await wrapper.get('[data-test="workflow-receipt-toggle"]').trigger('tap');
  expect(wrapper.get('[data-test="workflow-receipt"]').text()).toContain('分工结果 · 未完成');
  expect(wrapper.text()).toContain('具体原因未留存');
  expect(wrapper.text()).toContain('比较 · 未核对');
  expect(wrapper.text()).toContain('最终汇总 · 未核对');
  expect(wrapper.text()).toContain('原分析 <img src=x>');
  expect(wrapper.find('img').exists()).toBe(false);
  expect(wrapper.emitted('action')).toBeUndefined();
});
it('S54 resets an expanded result receipt when its request changes or disappears', async () => {
  const workflow = {
    version: 1,
    parentId: 's54-old',
    status: 'incomplete',
    tasks: [{ id: 'a', title: '原分析', status: 'completed', message: 'OLD_ACCOUNT_ANALYSIS' }],
    final: { status: 'unchecked' }
  };
  wrapper = mount(Feedback, { props: { workflow } });
  await wrapper.get('[data-test="workflow-receipt-toggle"]').trigger('tap');
  expect(wrapper.text()).toContain('OLD_ACCOUNT_ANALYSIS');
  await wrapper.setProps({ workflow: { ...workflow, parentId: 's54-new', tasks: [] } });
  expect(wrapper.find('[data-test="workflow-receipt"]').exists()).toBe(false);
  await wrapper.setProps({ workflow: null });
  expect(wrapper.text()).not.toContain('OLD_ACCOUNT_ANALYSIS');
  expect(wrapper.find('[data-test="workflow-receipt-toggle"]').exists()).toBe(false);
});
