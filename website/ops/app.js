(() => {
  const $ = (selector) => document.querySelector(selector);
  let credential = '',
    offset = 0,
    search = '',
    busy = false,
    generation = 0;
  const number = (value) => (value == null ? '未记录' : Number(value).toLocaleString('zh-CN'));
  const date = (value) =>
    value
      ? new Intl.DateTimeFormat('zh-CN', {
          timeZone: 'UTC',
          dateStyle: 'short',
          timeStyle: 'short',
          hour12: false
        }).format(new Date(value))
      : '未记录';
  const element = (name, text, className) => {
    const node = document.createElement(name);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const status = (value) =>
    ({
      active: '正常',
      blocked: '停用',
      deleted: '已注销',
      pending_deletion: '注销中',
      pending: '待确认',
      sent: '已发送',
      failed: '发送失败',
      uncertain: '投递待确认'
    })[value] || value;
  function table(target, columns, rows, append = false) {
    const root = $(target);
    if (!append) root.replaceChildren();
    if (!rows.length && !append) {
      root.append(element('p', '暂无记录', 'ops-empty'));
      return;
    }
    let body = append && root.querySelector('tbody');
    if (!body) {
      const node = element('table'),
        head = element('thead'),
        tr = element('tr');
      for (const [title] of columns) {
        const cell = element('th', title);
        cell.scope = 'col';
        tr.append(cell);
      }
      head.append(tr);
      body = element('tbody');
      node.append(head, body);
      root.append(node);
    }
    for (const row of rows) {
      const tr = element('tr');
      for (const [title, value] of columns) {
        const td = element('td');
        td.dataset.label = title;
        const result = value(row);
        td.append(result instanceof Node ? result : document.createTextNode(String(result)));
        tr.append(td);
      }
      body.append(tr);
    }
  }
  function userRows(data, append = false) {
    table(
      '[data-users]',
      [
        [
          '账户',
          (r) => {
            const node = element('span', r.email || r.name || r.id);
            if (r.name && r.email) node.append(element('small', r.name));
            return node;
          }
        ],
        ['状态', (r) => status(r.status)],
        ['订阅', () => '未启用'],
        ['模型请求', (r) => number(r.calls)],
        ['已结算费用', (r) => (r.settledCost == null ? '未记录' : '$' + r.settledCost.toFixed(4))],
        ['最近使用 · UTC', (r) => date(r.lastUsedAt)],
        ['注册 · UTC', (r) => date(r.createdAt)]
      ],
      data.users,
      append
    );
    offset = data.offset + data.users.length;
    $('[data-more]').hidden = !data.hasMore;
  }
  function chart(target, days, key) {
    const root = $(target),
      max = Math.max(1, ...days.map((d) => d[key] || 0));
    root.replaceChildren();
    for (const day of days) {
      const bar = element('div', null, 'ops-bar'),
        value = day[key];
      const fill = element('i');
      fill.style.height = `${value == null ? 2 : Math.max(2, (value / max) * 120)}px`;
      if (value == null) fill.style.background = 'var(--line)';
      bar.append(element('b', number(value)), fill, element('span', day.day.slice(5)));
      root.append(bar);
    }
  }
  function render(data) {
    const today = data.days.at(-1),
      total = (rows, key) => rows.reduce((sum, row) => sum + (row[key] || 0), 0);
    const stats = [
      ['账户', data.totalUsers],
      ['近 7 日使用人数', data.activeUsers7Days],
      ['今日访问', today.visits],
      ['今日接口请求', today.requests],
      ['今日接口异常', today.failures],
      [
        '待确认邮件',
        total(
          data.pool.outcomes.filter((r) => ['pending', 'uncertain'].includes(r._id)),
          'count'
        )
      ]
    ];
    $('[data-stats]').replaceChildren(
      ...stats.map(([label, value]) => {
        const block = element('div');
        block.append(element('dt', label), element('dd', number(value)));
        return block;
      })
    );
    chart('[data-visits]', data.days, 'visits');
    chart('[data-failures]', data.days, 'failures');
    userRows(data);
    const providers = $('[data-providers]');
    providers.replaceChildren();
    if (!data.pool.providers.length) providers.append(element('p', '尚未接入发信服务', 'ops-empty'));
    for (const provider of data.pool.providers) {
      const card = element('article', null, 'ops-provider');
      card.append(element('h3', provider.id));
      const remaining = element('p', '今日可用 ');
      remaining.append(element('strong', number(provider.dailyRemaining)));
      card.append(remaining);
      card.append(element('p', `今日 ${number(provider.dailyUsed)} / ${number(provider.dailyLimit)}`));
      card.append(
        element(
          'p',
          provider.monthlyLimit == null
            ? `本月已用 ${number(provider.monthlyUsed)}`
            : `本月 ${number(provider.monthlyUsed)} / ${number(provider.monthlyLimit)} · 可用 ${number(provider.monthlyRemaining)}`
        )
      );
      if (provider.blocked) card.append(element('p', '供应商额度已用尽'));
      providers.append(card);
    }
    table(
      '[data-deliveries]',
      [
        ['时间 · UTC', (r) => date(r.at)],
        ['产品', (r) => r.product],
        ['服务', (r) => r.provider || '未发送'],
        ['投递', (r) => status(r.status)],
        [
          '结果',
          (r) =>
            ({
              quota_exhausted: '额度已用尽',
              providers_unavailable: '服务不可用',
              delivery_unknown: '接收状态待确认',
              delivery_rejected: '供应商拒绝投递'
            })[r.reason] || (r.status === 'sent' ? '已被供应商接收' : '待确认')
        ]
      ],
      data.pool.recent
    );
    const features = new Map();
    for (const row of data.requests) {
      const current = features.get(row.endpoint) || { endpoint: row.endpoint, requests: 0, failures: 0, durationMs: 0 };
      for (const key of ['requests', 'failures', 'durationMs']) current[key] += row[key] || 0;
      features.set(row.endpoint, current);
    }
    table(
      '[data-usage]',
      [
        ['功能 / API', (r) => r.endpoint],
        ['请求', (r) => number(r.requests)],
        ['异常', (r) => number(r.failures)],
        ['平均耗时', (r) => `${Math.round(r.durationMs / r.requests)} ms`]
      ],
      [...features.values()].sort((a, b) => b.requests - a.requests)
    );
    const maintenance = $('[data-maintenance]');
    maintenance.replaceChildren();
    for (const row of data.maintenance) {
      const item = element('li');
      item.append(
        element('time', date(row.at)),
        element('span', `${row.event === 'backend_started' ? '后端启动' : row.event} · ${row.release}`)
      );
      maintenance.append(item);
    }
    if (!data.maintenance.length) maintenance.append(element('li', '暂无记录', 'ops-empty'));
    table(
      '[data-anomalies]',
      [
        ['时间 · UTC', (r) => date(r.timestamp)],
        [
          '活动',
          (r) =>
            ({ authentication_denied: '登录未通过', authorization_denied: '权限不足', rate_limited: '触发限流' })[
              r.event
            ] || r.event
        ],
        ['接口', (r) => r.endpoint],
        ['状态', (r) => r.code]
      ],
      data.anomalies
    );
    $('[data-updated]').textContent = `UTC · ${date(data.at)}`;
    $('[data-dashboard]').hidden = false;
    $('[data-authenticated]').hidden = false;
    $('[data-login]').hidden = true;
  }
  function signOut() {
    generation++;
    busy = false;
    credential = '';
    $('#ops-secret').value = '';
    $('[data-dashboard]').hidden = true;
    $('[data-authenticated]').hidden = true;
    $('[data-login]').hidden = false;
    for (const selector of [
      '[data-stats]',
      '[data-visits]',
      '[data-failures]',
      '[data-users]',
      '[data-providers]',
      '[data-deliveries]',
      '[data-usage]',
      '[data-maintenance]',
      '[data-anomalies]',
      '[data-updated]'
    ])
      $(selector).replaceChildren();
    for (const button of document.querySelectorAll('[data-login] button,[data-refresh]')) button.disabled = false;
    $('[data-error]').hidden = true;
    $('[data-login-error]').hidden = true;
    $('#ops-secret').focus();
  }
  async function request(body) {
    const response = await fetch('/exam-master/operations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-secret': credential },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000)
    });
    if (response.status === 403 || response.status === 401)
      throw Object.assign(new Error('运营密钥不正确，请重新输入。'), { unauthorized: true });
    const result = await response.json();
    if (!response.ok || result.code !== 0) throw new Error(result.message || '暂时无法读取，请重试。');
    return result.data;
  }
  async function load() {
    if (busy) return;
    busy = true;
    const current = generation;
    $('[data-login-error]').hidden = true;
    $('[data-error]').hidden = true;
    for (const button of document.querySelectorAll('[data-login] button,[data-refresh]')) button.disabled = true;
    try {
      const data = await request({ view: 'overview' });
      if (current !== generation) return;
      render(data);
      search = '';
      $('#ops-search').value = '';
      $('.ops-heading h1').focus();
    } catch (error) {
      if (current !== generation) return;
      if (error.unauthorized) signOut();
      const target = $('[data-login]').hidden ? $('[data-error]') : $('[data-login-error]');
      target.textContent = error.name === 'TimeoutError' ? '读取超时，请重试。' : error.message;
      target.hidden = false;
    } finally {
      if (current === generation) {
        busy = false;
        for (const button of document.querySelectorAll('[data-login] button,[data-refresh]')) button.disabled = false;
      }
    }
  }
  $('[data-login]').addEventListener('submit', (event) => {
    event.preventDefault();
    credential = $('#ops-secret').value;
    $('#ops-secret').value = '';
    void load();
  });
  $('[data-refresh]').addEventListener('click', load);
  $('[data-signout]').addEventListener('click', signOut);
  async function loadUsers(append) {
    if (busy) return;
    busy = true;
    $('[data-error]').hidden = true;
    const current = generation;
    try {
      const data = await request({ view: 'users', search, offset: append ? offset : 0 });
      if (current === generation) userRows(data, append);
    } catch (error) {
      if (current !== generation) return;
      if (error.unauthorized) signOut();
      const target = error.unauthorized ? $('[data-login-error]') : $('[data-error]');
      target.textContent = error.message;
      target.hidden = false;
    } finally {
      if (current === generation) busy = false;
    }
  }
  $('[data-user-search]').addEventListener('submit', (event) => {
    event.preventDefault();
    search = $('#ops-search').value.trim();
    void loadUsers(false);
  });
  $('[data-more]').addEventListener('click', () => void loadUsers(true));
})();
