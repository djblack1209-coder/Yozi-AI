// Verifies /account/ in a real browser: zh and en, 1280 and 390, normal and WeChat user agents.
// usage: YOZI_ACCOUNT_EMAIL=… YOZI_ACCOUNT_PASSWORD=… node scripts/build/verify-website-account.mjs <base-url>
//          [--serve=dist/website --proxy=127.0.0.1:4382] [--evidence=<dir>]
// --serve hosts a build the way nginx does (try_files, then 404; /exam-master/ proxied same-origin).
// Prints JSON and exits non-zero on any failure. Credentials never reach the output.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const baseArgument = process.argv[2];
if (!baseArgument || baseArgument.startsWith('--')) throw new Error('Pass the website base URL as the first argument');
const email = process.env.YOZI_ACCOUNT_EMAIL;
const password = process.env.YOZI_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error('Set YOZI_ACCOUNT_EMAIL and YOZI_ACCOUNT_PASSWORD');

const base = new URL(baseArgument);
const local = ['127.0.0.1', 'localhost'].includes(base.hostname);
const evidence = option('evidence');
const safariDesktop =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const wechat =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x1800322d) NetType/WIFI Language/zh_CN';
// The production login limit is five a minute per address.
const paceMs = Number(process.env.YOZI_ACCOUNT_PACE_MS ?? (local ? 0 : 13000));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json'
};

function serve(directory, proxyAddress, port) {
  const root = path.resolve(directory);
  const [proxyHost, proxyPort] = proxyAddress.split(':');
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://local');
    if (url.pathname.startsWith('/exam-master/')) {
      const headers = {
        ...request.headers,
        'x-real-ip': '127.0.0.1',
        'x-forwarded-for': '127.0.0.1',
        'x-forwarded-proto': 'https'
      };
      const upstream = http.request(
        {
          host: proxyHost,
          port: proxyPort,
          method: request.method,
          path: url.pathname.slice('/exam-master'.length) + url.search,
          headers
        },
        (reply) => {
          response.writeHead(reply.statusCode, reply.headers);
          reply.pipe(response);
        }
      );
      upstream.on('error', () => {
        response.writeHead(502).end();
      });
      request.pipe(upstream);
      return;
    }
    const target = path.join(root, decodeURIComponent(url.pathname));
    const inside = target === root || target.startsWith(root + path.sep);
    const isDirectory = inside && fs.existsSync(target) && fs.statSync(target).isDirectory();
    // nginx `try_files $uri $uri/ =404`: a folder needs its trailing slash and an index.
    const file = !inside
      ? null
      : isDirectory
        ? url.pathname.endsWith('/')
          ? path.join(target, 'index.html')
          : null
        : target;
    if (isDirectory && !url.pathname.endsWith('/') && fs.existsSync(path.join(target, 'index.html'))) {
      response.writeHead(301, { Location: `${url.pathname}/` }).end();
      return;
    }
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(response);
      return;
    }
    response.writeHead(404, { 'Content-Type': types['.html'] });
    response.end(fs.readFileSync(path.join(root, '404.html')));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const failures = [];
const check = (run, name, passed, detail) => {
  run.checks[name] = passed;
  if (!passed) failures.push(`${run.id}: ${name}${detail ? ` (${detail})` : ''}`);
};
const capture = async (page, run, step) => {
  if (!evidence) return;
  fs.mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: path.join(evidence, `${run.id}-${step}.png`), fullPage: true });
};
const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shown = (page, selector) => page.locator(selector).isVisible();

async function runAccount(browser, spec) {
  const run = { id: `${spec.lang}-${spec.width}-${spec.ua}`, ...spec, checks: {} };
  const context = await browser.newContext({
    viewport: { width: spec.width, height: spec.height },
    userAgent: spec.ua === 'wechat' ? wechat : safariDesktop
  });
  const page = await context.newPage();
  const api = [];
  const foreign = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== base.origin) foreign.push(url.origin);
    if (url.pathname.startsWith('/exam-master/'))
      api.push({ path: url.pathname, method: request.method(), action: request.postDataJSON?.()?.action });
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const response = await page.goto(new URL('/account/', base).href, { waitUntil: 'load' });
    check(run, 'page 200', response.status() === 200, String(response.status()));
    check(run, 'noindex', (await page.locator('meta[name="robots"]').getAttribute('content')) === 'noindex');
    if (spec.lang === 'en') await page.locator('[data-language-toggle]').click();
    check(
      run,
      'language',
      (await page.evaluate(() => document.documentElement.lang)) === (spec.lang === 'en' ? 'en' : 'zh-CN')
    );
    check(run, 'signed-out shows form', await shown(page, '[data-signin-form]'));
    check(
      run,
      'signed-out hides progress',
      !(await shown(page, '[data-view="progress"]')) && !(await shown(page, '[data-sign-out]'))
    );
    check(run, 'signed-out no requests', api.length === 0, JSON.stringify(api));
    check(run, 'signed-out no overflow', (await overflow(page)) <= 0);
    await capture(page, run, 'signed-out');

    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('[data-signin-submit]').click();
    await page.waitForFunction(
      () => {
        const content = document.querySelector('[data-progress-content]');
        const status = document.querySelector('[data-progress-status]');
        return (
          !content.hidden ||
          (!status.hidden && status.hasAttribute('data-final')) ||
          document.querySelector('[data-retry]').hidden === false ||
          !document.querySelector('[data-signin-error]').hidden ||
          (!status.hidden && !/…$/.test(status.textContent))
        );
      },
      null,
      { timeout: 60000 }
    );
    const signInError = await page.locator('[data-signin-error]').textContent();
    check(run, 'signed in', await shown(page, '[data-view="progress"]'), signInError || '');
    const contentShown = await shown(page, '[data-progress-content]');
    run.hasRecords = contentShown;
    run.status = (await page.locator('[data-progress-status]').textContent()) || '';
    check(run, 'no retry prompt', !(await shown(page, '[data-retry]')), run.status);
    run.progress = await page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('[data-stat]')].map((node) => [node.dataset.stat, node.textContent])
      )
    );
    const thin = await page.evaluate(() =>
      [...document.querySelectorAll('[data-nodes] li, [data-subjects] li')]
        .map((row) => row.querySelector('span:last-child'))
        .filter((value) => value.hasAttribute('data-insufficient'))
        .map((value) => value.textContent)
    );
    run.insufficientRows = thin.length;
    const expected = spec.lang === 'en' ? 'Not enough data' : '数据不足';
    check(
      run,
      'thin rows show the words and no percentage',
      thin.every((value) => value === expected),
      thin.find((value) => value !== expected)
    );
    const session = await page.evaluate(() => Object.keys(sessionStorage));
    check(run, 'one session key', session.length === 1 && session[0] === 'yozi.account.session', session.join(','));
    const paths = [...new Set(api.map((item) => item.path))];
    check(
      run,
      'only login and snapshot sent',
      paths.every((item) => ['/exam-master/login', '/exam-master/learning-sync'].includes(item)),
      paths.join(',')
    );
    check(run, 'one login', api.filter((item) => item.path === '/exam-master/login').length === 1);
    check(
      run,
      'snapshot read only',
      api
        .filter((item) => item.path.endsWith('/learning-sync'))
        .every((item) => ['pull', 'page'].includes(item.action)),
      JSON.stringify(api)
    );
    check(
      run,
      'post only',
      api.every((item) => item.method === 'POST')
    );
    check(run, 'token not in address', !/token|bearer/i.test(page.url()));
    check(run, 'signed-in no overflow', (await overflow(page)) <= 0);
    check(run, 'no foreign requests', foreign.length === 0, foreign.join(','));
    await capture(page, run, 'signed-in');
    run.requests = api;

    await page.locator('[data-sign-out]').click();
    await page.locator('[data-signin-form]').waitFor({ state: 'visible' });
    check(run, 'sign-out clears session', (await page.evaluate(() => sessionStorage.length)) === 0);
    check(run, 'sign-out hides progress', !(await shown(page, '[data-view="progress"]')));
    check(run, 'sign-out clears figures', (await page.locator('[data-stat="studyDays"]').textContent()) === '');
    check(run, 'no script errors', errors.length === 0, errors[0]);
  } catch (error) {
    failures.push(`${run.id}: ${error.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
  return run;
}

async function run() {
  const server = option('serve')
    ? await serve(option('serve'), option('proxy') || '127.0.0.1:4382', Number(base.port))
    : null;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = { base: base.origin, runs: [], routes: {} };
  try {
    const specs = [];
    for (const lang of ['zh', 'en'])
      for (const [width, height] of [
        [1280, 800],
        [390, 844]
      ])
        for (const ua of ['normal', 'wechat']) specs.push({ lang, width, height, ua });
    specs.push({ lang: 'zh', width: 320, height: 640, ua: 'normal' });
    for (const [index, spec] of specs.entries()) {
      if (index && paceMs) await new Promise((resolve) => setTimeout(resolve, paceMs));
      report.runs.push(await runAccount(browser, spec));
    }
    const routes = { checks: {}, id: 'routes' };
    for (const route of ['/auth', '/auth/']) {
      const status = (await fetch(new URL(route, base), { redirect: 'manual' })).status;
      report.routes[route] = status;
      check(routes, `${route} is 404`, status === 404, String(status));
    }
    const sitemap = await (await fetch(new URL('/sitemap.xml', base))).text();
    report.routes.sitemapListsAccount = sitemap.includes('account');
    check(routes, 'sitemap omits account', !sitemap.includes('account'));
  } finally {
    await browser.close();
    server?.close();
  }
  report.failures = failures;
  report.ok = failures.length === 0;
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}

await run();
