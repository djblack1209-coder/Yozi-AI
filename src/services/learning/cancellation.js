// The native uni-app script engine can lack the browser's AbortController.
export function createLearningAbortController() {
  if (typeof AbortController === 'function') return new AbortController();

  const listeners = new Set();
  let aborted = false;
  let reason;
  const signal = {
    get aborted() {
      return aborted;
    },
    get reason() {
      return reason;
    },
    addEventListener(type, listener) {
      if (type === 'abort' && !aborted) listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'abort') listeners.delete(listener);
    }
  };

  return {
    signal,
    abort(cause) {
      if (aborted) return;
      reason = cause;
      aborted = true;
      for (const listener of listeners) {
        try {
          listener();
        } catch (error) {
          // Report the failure after giving the other requests a chance to cancel.
          setTimeout(() => {
            throw error;
          }, 0);
        }
      }
      listeners.clear();
    }
  };
}
