// shared/now.js
// Same monotonic-ish clock as diagnostics/shared/now.js -- performance.now()
// where available, Date.now() fallback. Used for job-run duration timing.

export function now () {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}
