import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderOperations } from '../../website/render.mjs';

const template = renderOperations();
const script = template.match(/<script>([\s\S]*?)<\/script>/)[1];
const data = {
  at: Date.now(),
  totalUsers: 1,
  activeUsers7Days: 1,
  offset: 0,
  hasMore: false,
  users: [
    {
      id: 'u1',
      email: 'student@example.test',
      name: '<script>unsafe</script>',
      status: 'active',
      calls: 1,
      settledCost: 0.1
    }
  ],
  days: Array.from({ length: 7 }, (_, i) => ({
    day: `2026-11-${String(i + 1).padStart(2, '0')}`,
    visits: i === 6 ? 1 : null,
    requests: null,
    failures: null
  })),
  pool: { providers: [], outcomes: [], recent: [] },
  requests: [],
  maintenance: [],
  anomalies: []
};
const response = (value = data) => ({ ok: true, status: 200, json: async () => ({ code: 0, data: value }) });
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const $ = (selector) => document.querySelector(selector);
async function login() {
  $('#ops-secret').value = 'TEST_ONLY_operator';
  $('[data-login]').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
}
beforeEach(() => {
  document.documentElement.innerHTML = template
    .slice(template.indexOf('<head>'), template.lastIndexOf('</html>'))
    .replace(/<script>[\s\S]*?<\/script>/g, '')
    .replace(/\{\{\w+\}\}/g, '');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response())
  );
  new Function(script)();
});
afterEach(() => vi.unstubAllGlobals());

it('keeps the credential in memory, renders user text safely and clears all private views on logout', async () => {
  const local = vi.spyOn(Storage.prototype, 'setItem');
  await login();
  expect(fetch.mock.calls[0][1].headers['x-admin-secret']).toBe('TEST_ONLY_operator');
  expect($('#ops-secret').value).toBe('');
  expect($('[data-users]').textContent).toContain('<script>unsafe</script>');
  expect($('[data-users] script')).toBeNull();
  expect(local).not.toHaveBeenCalled();
  $('[data-signout]').click();
  expect($('[data-dashboard]').hidden).toBe(true);
  expect($('[data-users]').textContent).toBe('');
  expect($('[data-stats]').textContent).toBe('');
  local.mockRestore();
});

it.each(['overview', 'users'])(
  'does not restore private data when a pending %s request finishes after logout',
  async (view) => {
    await login();
    let finish;
    fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    if (view === 'overview') $('[data-refresh]').click();
    else {
      $('#ops-search').value = 'student';
      $('[data-user-search]').dispatchEvent(new Event('submit', { cancelable: true }));
    }
    await flush();
    $('[data-signout]').click();
    finish(response());
    await flush();
    expect($('[data-dashboard]').hidden).toBe(true);
    expect($('[data-users]').textContent).toBe('');
    expect($('[data-login] button').disabled).toBe(false);
  }
);

it('returns to the sign-in form on denied access and shows a recoverable error', async () => {
  fetch.mockImplementationOnce(async () => ({ status: 403 }));
  await login();
  expect($('[data-dashboard]').hidden).toBe(true);
  expect($('[data-login-error]').textContent).toContain('运营密钥不正确');
  expect($('[data-login] button').disabled).toBe(false);
});
