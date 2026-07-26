// shared/now.js
// Same clock primitive as diagnostics/shared/now.js -- performance.now()
// where available, falling back to Date.now(). Used only for timing BI's
// own calculations (via diagnostics/'s ExecutionTimeline); business dates
// (last sale, last purchase, batch age) always come from the data itself,
// never from this clock.

export function now () {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}
