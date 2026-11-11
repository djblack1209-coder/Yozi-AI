// One app-owned timer, released with the store. No server daemon, model call,
// or writes to canonical learning facts. Changed sources run after the current
// interaction; unchanged sources are reconciled daily and on a due resume.
export function createLearningMemoryReconciler({
  context,
  ready,
  reconcile,
  now = Date.now,
  onResult = () => {},
  onError = () => {}
}) {
  let timer = null;
  let stopped = false;
  let paused = false;
  let generation = 0;
  const cancel = () => {
    generation++;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  function schedule(delay = 0) {
    cancel();
    if (stopped || paused) return;
    const expected = context();
    const scheduled = generation;
    const isCurrent = () =>
      !stopped && !paused && scheduled === generation && ready() && expected && context() === expected;
    timer = setTimeout(async () => {
      timer = null;
      if (!isCurrent()) return;
      try {
        const result = await reconcile(isCurrent);
        if (!isCurrent()) return;
        onResult(result);
        schedule(Math.max(1, result.reconciledAt + 86400000 - now()));
      } catch (error) {
        if (isCurrent()) onError(error);
        // A write failure is retried on the next interaction/resume, not a hot loop.
      }
    }, delay);
    timer?.unref?.();
  }
  return {
    schedule,
    cancel,
    pause() {
      paused = true;
      cancel();
    },
    resume() {
      paused = false;
      schedule();
    },
    dispose() {
      stopped = true;
      cancel();
    }
  };
}
