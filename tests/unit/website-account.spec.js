import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { emptyLearningState } from '@/services/learning/learning-domain.js';
import { encodeHistory } from '../../laf-backend/functions/_shared/learning-history.js';
import { mountAccount } from '../../website/account/app.js';
import { SESSION_KEY } from '../../website/account/client.mjs';

const template = readFileSync(join(process.cwd(), 'website/account/index.html'), 'utf8');
const owner = 'user_a';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    keys: () => [...values.keys()]
  };
}
const json = (value, status = 200) => ({ status, json: async () => value });
const loginOk = json({ code: 0, data: { token: 'token-a', userId: owner } });
const pulled = (state) => json({ code: 0, success: true, data: { state } });
const visible = (selector) => !document.querySelector(selector).hidden;
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

function page({ session, responses }) {
  // Slots are replaced by their key so the template itself is what is under test.
  const html = template
    .replace(/<script>\{\{\w+\}\}<\/script>/g, '')
    .replace(/<style>\{\{\w+\}\}<\/style>/, '')
    .replace(/\{\{(\w+)\}\}/g, (_, key) => key);
  document.documentElement.innerHTML = html.slice(html.indexOf('<head>'), html.lastIndexOf('</html>'));
  document.documentElement.lang = 'zh-CN';
  const storage = memoryStorage(session ? { [SESSION_KEY]: JSON.stringify(session) } : {});
  const calls = [];
  const queue = [...responses];
  const send = vi.fn(async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    const next = queue.shift();
    if (next === 'offline') throw new TypeError('Failed to fetch');
    if (!next) throw new Error(`Unexpected request: ${url}`);
    return next;
  });
  const ready = mountAccount({ doc: document, send, storage, persistent: memoryStorage() });
  return { storage, calls, ready, send };
}
async function submit(email = ' A@Example.CN ', password = 'correct horse') {
  const form = document.querySelector('[data-signin-form]');
  form.elements.email.value = email;
  form.elements.password.value = password;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  await new Promise((resolve) => setTimeout(resolve));
  await flush();
}

afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  document.title = '';
});

describe('/account/ signed-out view', () => {
  it('shows only the sign-in form and sends nothing', async () => {
    const { calls, ready } = page({ responses: [] });
    await ready;
    expect(visible('[data-view="signin"]')).toBe(true);
    expect(visible('[data-view="progress"]')).toBe(false);
    expect(visible('[data-sign-out]')).toBe(false);
    expect(document.querySelector('[data-stat="studyDays"]').textContent).toBe('');
    expect(calls).toEqual([]);
    expect(template).toContain('<meta name="robots" content="noindex">');
  });
});

describe('/account/ sign-in', () => {
  it('sends the App email payload once to /exam-master/login', async () => {
    const { calls, ready } = page({ responses: [loginOk, pulled(emptyLearningState(owner))] });
    await ready;
    await submit();
    expect(calls[0].url).toBe('/exam-master/login');
    expect(calls[0].body).toEqual({ region: 'CN', type: 'email', email: 'a@example.cn', password: 'correct horse' });
    expect(calls[0].options.method).toBe('POST');
    expect(calls[0].options.headers.Authorization).toBeUndefined();
  });

  it.each([
    [json({ code: 401, success: false, message: '密码错误' }), '邮箱或密码不对'],
    [json({ code: 400, success: false, message: '新用户注册需先完成邮箱验证码校验' }), '邮箱或密码不对'],
    [json({ code: 429, success: false, message: '请求过于频繁', retryAfter: 42 }), '42 秒后'],
    ['offline', '检查网络'],
    [json({ code: 401, success: false, message: '该账号未设置密码，请使用验证码登录' }), '在 App 中登录']
  ])('names the cause and recovery without retrying (%#)', async (response, expected) => {
    const { calls, storage, ready } = page({ responses: [response] });
    await ready;
    await submit();
    expect(document.querySelector('[data-signin-error]').textContent).toContain(expected);
    expect(visible('[data-view="progress"]')).toBe(false);
    expect(calls).toHaveLength(1);
    expect(storage.keys()).toEqual([]);
  });

  it('asks for both fields before sending', async () => {
    const { calls, ready } = page({ responses: [] });
    await ready;
    await submit('', '');
    expect(document.querySelector('[data-signin-error]').textContent).toContain('请输入邮箱和密码');
    expect(calls).toEqual([]);
  });
});

describe('/account/ session', () => {
  it('keeps one sessionStorage key and clears it on sign-out', async () => {
    const { storage, ready } = page({ responses: [loginOk, pulled(emptyLearningState(owner))] });
    await ready;
    await submit();
    expect(storage.keys()).toEqual([SESSION_KEY]);
    expect(location.href).not.toContain('token-a');
    document.querySelector('[data-sign-out]').click();
    await flush();
    expect(storage.keys()).toEqual([]);
    expect(visible('[data-view="signin"]')).toBe(true);
    expect(visible('[data-view="progress"]')).toBe(false);
  });

  it('clears the session on a 401 and returns to sign-in', async () => {
    const { storage, ready, calls } = page({
      session: { token: 'stale', owner },
      responses: [json({ code: 401, success: false, message: '登录已过期' }, 401)]
    });
    await ready;
    expect(calls[0].options.headers.Authorization).toBe('Bearer stale');
    expect(storage.keys()).toEqual([]);
    expect(visible('[data-view="signin"]')).toBe(true);
    expect(document.querySelector('[data-signin-error]').textContent).toContain('重新登录');
  });

  it('refuses a snapshot that belongs to another account', async () => {
    const { storage, ready } = page({
      session: { token: 'token-a', owner },
      responses: [pulled(emptyLearningState('user_b'))]
    });
    await ready;
    expect(storage.keys()).toEqual([]);
    expect(visible('[data-view="signin"]')).toBe(true);
    expect(document.querySelector('[data-stat="studyDays"]').textContent).toBe('');
  });

  it('keeps the session and offers a retry when the network fails', async () => {
    const { storage, ready } = page({ session: { token: 'token-a', owner }, responses: ['offline'] });
    await ready;
    expect(storage.keys()).toEqual([SESSION_KEY]);
    expect(document.querySelector('[data-progress-status]').textContent).toContain('检查网络');
    expect(visible('[data-retry]')).toBe(true);
  });
});

describe('/account/ progress', () => {
  function recorded() {
    const state = emptyLearningState(owner);
    state.events = [{ id: 'e1', type: 'x', at: Date.parse('2026-10-20T05:00:00Z') }];
    state.attempts = [];
    return state;
  }

  it('shows 数据不足 and no percentage for thin nodes, in both languages', async () => {
    const { ready } = page({ session: { token: 'token-a', owner }, responses: [pulled(recorded())] });
    await ready;
    const nodes = document.querySelector('[data-nodes]');
    expect(nodes.textContent).toContain('数据不足');
    expect(nodes.textContent).not.toContain('%');
    expect(document.querySelector('[data-subjects]').textContent).not.toContain('%');
    document.querySelector('[data-language-toggle]').click();
    expect(document.querySelector('[data-nodes]').textContent).toContain('Not enough data');
    expect(document.querySelector('[data-nodes]').textContent).not.toContain('%');
  });

  it('explains an account with nothing synced', async () => {
    const { ready } = page({ session: { token: 'token-a', owner }, responses: [pulled(emptyLearningState(owner))] });
    await ready;
    expect(document.querySelector('[data-progress-status]').textContent).toContain('还没有同步');
    expect(visible('[data-progress-content]')).toBe(false);
  });

  it('reads a paged history with the pullSnapshot request and sends nothing that writes', async () => {
    const state = recorded();
    state.revision = 7;
    state.events.push(
      ...Array.from({ length: 900 }, (_, index) => ({
        id: `n${index}`,
        type: 'x',
        at: 1000 + index,
        data: 'y'.repeat(300)
      }))
    );
    const { manifest, pages } = encodeHistory(state, owner, 'generation_1');
    expect(manifest.checksums.length).toBeGreaterThan(1);
    const history = json({ code: 0, success: true, data: { history: manifest, revision: 7 } });
    const parts = [];
    for (let offset = 0; offset < pages.length; offset += 3) {
      const chunk = pages.slice(offset, offset + 3);
      parts.push(
        json({ code: 0, success: true, data: { owner, revision: 7, generation: 'generation_1', offset, pages: chunk } })
      );
    }
    const { calls, ready } = page({ responses: [loginOk, history, ...parts] });
    await ready;
    await submit();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls.map((call) => call.url)).toEqual([
      '/exam-master/login',
      ...Array(parts.length + 1).fill('/exam-master/learning-sync')
    ]);
    expect(calls[1].body).toEqual({ action: 'pull', timezone: 'Asia/Shanghai' });
    expect(calls[2].body).toEqual({ action: 'page', revision: 7, generation: 'generation_1', offset: 0, count: 3 });
    expect(new Set(calls.slice(1).map((call) => call.body.action))).toEqual(new Set(['pull', 'page']));
    expect(visible('[data-progress-content]')).toBe(true);
  });
});

describe('/account/ build output', () => {
  it('writes account/index.html, no auth route, and stays out of the sitemap', async () => {
    const root = mkdtempSync(join(process.cwd(), 'tmp-website-account-'));
    try {
      const output = join(root, 'website');
      execFileSync(process.execPath, ['scripts/build/website-launch.mjs', output], { stdio: 'pipe' });
      expect(existsSync(join(output, 'account/index.html'))).toBe(true);
      expect(existsSync(join(output, 'auth'))).toBe(false);
      expect(readFileSync(join(output, 'sitemap.xml'), 'utf8')).not.toContain('account');
      const html = readFileSync(join(output, 'account/index.html'), 'utf8');
      expect(html).toContain('<meta name="robots" content="noindex">');
      expect(html).not.toMatch(
        /https?:\/\/(?!yozi\.bot\.cd|www\.w3\.org)[a-z0-9.-]+\.[a-z]{2,}\/[^"' ]*\.(js|css|woff2?)/
      );
      for (const home of ['index.html', 'zh/index.html', 'en/index.html'])
        expect(readFileSync(join(output, home), 'utf8')).toContain('href="/account/"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);
});
