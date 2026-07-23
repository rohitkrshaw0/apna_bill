// progress/progressTracker.js
// Reusable progress tracking with UI-ready events -- no UI implementation
// here, just state + a tiny pub-sub future screens can subscribe to.

export function createProgressTracker () {
  const startedAt = Date.now();
  let state = { currentModule: null, currentRecord: 0, totalRecords: 0, successCount: 0, failureCount: 0 };
  const listeners = [];

  function snapshot () {
    return {
      ...state,
      percentage: percentage(),
      elapsedMs: elapsedMs(),
      estimatedRemainingMs: estimatedRemainingMs()
    };
  }

  function percentage () {
    return state.totalRecords === 0 ? 0 : Math.min(100, (state.currentRecord / state.totalRecords) * 100);
  }

  function elapsedMs () { return Date.now() - startedAt; }

  function estimatedRemainingMs () {
    const pct = percentage();
    if (pct <= 0) return null;
    return Math.round((elapsedMs() / pct) * (100 - pct));
  }

  function update (partial) {
    state = { ...state, ...partial };
    const event = snapshot();
    for (const listener of listeners) listener(event);
    return event;
  }

  return {
    update,
    percentage,
    elapsedMs,
    estimatedRemainingMs,
    snapshot,
    on: (handler) => { listeners.push(handler); },
    off: (handler) => { const i = listeners.indexOf(handler); if (i >= 0) listeners.splice(i, 1); }
  };
}
