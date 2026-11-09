import { afterEach, describe, expect, it, vi } from 'vitest';

const originalUni = globalThis.uni;

describe('network monitor platform compatibility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    globalThis.uni = originalUni;
  });

  it('falls back to navigator status when H5 uni exists without network APIs', async () => {
    vi.resetModules();
    globalThis.uni = {
      onNetworkStatusChange: vi.fn(),
      offNetworkStatusChange: vi.fn()
    };

    const { networkMonitor } = await import('@/utils/core/network-monitor.js');

    expect(networkMonitor.getNetworkType()).toBe('wifi');
    expect(networkMonitor.isOnline()).toBe(true);
    expect(globalThis.uni.onNetworkStatusChange).toHaveBeenCalled();
    networkMonitor.destroy();
  });

  it('reacts to browser reachability even when network type stays unchanged', async () => {
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    globalThis.uni = {
      getNetworkType: ({ success }) => success({ networkType: 'wifi' }),
      onNetworkStatusChange: vi.fn(),
      offNetworkStatusChange: vi.fn()
    };
    const { networkMonitor } = await import('@/utils/core/network-monitor.js');
    networkMonitor.configure({ autoSyncOnRecover: false, showToast: false });

    online.mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    expect(networkMonitor.isOffline()).toBe(true);
    expect(networkMonitor.getNetworkType()).toBe('none');

    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    expect(networkMonitor.isOnline()).toBe(true);
    networkMonitor.destroy();

    online.mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    expect(networkMonitor.isOnline()).toBe(true);
  });
});
