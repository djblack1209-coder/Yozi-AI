import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { appBootPlugin } from '../../scripts/build/app-boot.mjs';
import { bindAppBoot, mountAppBoot } from '@/design/app-boot.js';

const document = '<html lang="zh-CN"><head></head><body><div id="app"></div></body></html>';
describe('App entrance before the page bundle loads', () => {
  it('preserves website documents exactly', () => {
    expect(appBootPlugin(false).transformIndexHtml.handler(document)).toBe(document);
  });
  it('paints the approved transparent brand on the Muse surface without another script or caption', () => {
    const result = appBootPlugin(true).transformIndexHtml.handler(document);
    expect(result).toContain('data-yozi-app');
    expect(result).toContain('src="/static/brand/kitten-avatar.png"');
    expect(result).toContain('#181819');
    expect(result).toContain('#fcfcfc');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('正在');
    expect(result.match(/id="app"/g)).toHaveLength(1);
  });
  it('rejects an incompatible mount point instead of silently losing the entrance', () => {
    expect(() => appBootPlugin(true).transformIndexHtml.handler('<html></html>')).toThrow('mount point');
  });
});

describe('App asynchronous route handoff', () => {
  let stop = () => undefined;
  afterEach(() => {
    stop();
    globalThis.document.body.innerHTML = '';
    vi.useRealTimers();
  });
  it('keeps the first frame through an empty route and removes it only when content mounts', async () => {
    vi.useFakeTimers();
    globalThis.document.body.innerHTML =
      '<div id="yozi-app-boot"></div><div id="app"><uni-page-body></uni-page-body></div>';
    stop = mountAppBoot();
    await vi.advanceTimersByTimeAsync(1000);
    expect(globalThis.document.getElementById('yozi-app-boot')).not.toBeNull();
    globalThis.document.querySelector('uni-page-body').append(globalThis.document.createElement('main'));
    await flushPromises();
    expect(globalThis.document.getElementById('yozi-app-boot')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('releases the observer and timeout on disposal without affecting website pages', async () => {
    vi.useFakeTimers();
    expect(mountAppBoot()).toBeTypeOf('function');
    expect(vi.getTimerCount()).toBe(0);
    globalThis.document.body.innerHTML = '<div id="yozi-app-boot"></div><div id="app"></div>';
    stop = mountAppBoot();
    stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(globalThis.document.getElementById('yozi-app-boot')).toBeNull();
    await vi.advanceTimersByTimeAsync(10000);
    expect(globalThis.document.getElementById('app')).not.toBeNull();
  });
  it('supports the actual uni-app adapter without the newer App.onUnmount API', () => {
    vi.useFakeTimers();
    globalThis.document.body.innerHTML = '<div id="yozi-app-boot"></div><div id="app"></div>';
    const app = { unmount: vi.fn(() => 'released') };
    const original = app.unmount;
    expect(() => bindAppBoot(app)).not.toThrow();
    expect(app.unmount()).toBe('released');
    expect(original).toHaveBeenCalledOnce();
    expect(globalThis.document.getElementById('yozi-app-boot')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
