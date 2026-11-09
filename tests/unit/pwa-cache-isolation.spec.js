import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  publicImageMatch,
  publicFontMatch,
  appShellNavigationAllowlist
} from '../../scripts/build/pwa-cache-policy.mjs';

const context = (path, authorization = false, origin = 'https://exam.example') => ({
  url: new URL(path, origin),
  sameOrigin: origin === 'https://exam.example',
  request: new Request(new URL(path, origin), { headers: authorization ? { authorization: 'Bearer TEST_ONLY' } : {} })
});
describe('PWA只缓存公共静态资源', () => {
  it('根路径 hash 应用可离线导航，私人和独立服务器地址不冒充首页', () => {
    const allows = (url) => appShellNavigationAllowlist.some((pattern) => pattern.test(url));
    for (const url of ['/', '/?from=learning', '/index.html']) expect(allows(url)).toBe(true);
    for (const url of [
      '/learning-sync',
      '/user-profile',
      '/storage/private.pdf',
      '/independent.html',
      '/__test-session'
    ])
      expect(allows(url)).toBe(false);
  });
  it('不缓存鉴权图片、私人storage/API、跨来源或写入请求', () => {
    expect(publicImageMatch(context('/static/images/book.webp'))).toBe(true);
    expect(publicImageMatch(context('/public/visual/nomi/kitten.png'))).toBe(false);
    expect(publicImageMatch(context('/public/visual/nomi/private.png'))).toBe(false);
    for (const x of [
      context('/static/images/book.webp', true),
      context('/storage/private.webp'),
      context('/user-profile'),
      context('/static/images/book.webp', false, 'https://private.example')
    ])
      expect(publicImageMatch(x)).toBe(false);
    const x = context('/static/images/book.webp');
    x.request = new Request(x.url, { method: 'POST' });
    expect(publicImageMatch(x)).toBe(false);
    expect(publicFontMatch(context('/static/fonts/a.woff2'))).toBe(true);
    expect(publicFontMatch(context('/storage/font.woff2'))).toBe(false);
  });
  it('SW激活只删除三种旧派生HTTP缓存，不清空学习事实库', async () => {
    const removed = [];
    let pending;
    vm.runInNewContext(readFileSync('public/sw-cache-cleanup.js', 'utf8'), {
      self: {
        addEventListener: (name, handler) => {
          expect(name).toBe('activate');
          handler({
            waitUntil: (p) => {
              pending = p;
            }
          });
        }
      },
      caches: {
        delete: async (name) => {
          removed.push(name);
          return true;
        }
      }
    });
    await pending;
    expect(removed).toEqual(['api-cache', 'image-cache', 'font-cache']);
  });
});
