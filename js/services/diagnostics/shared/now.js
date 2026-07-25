// shared/now.js
// One monotonic-ish clock used everywhere duration is measured in this
// platform -- performance.now() where available (monotonic, sub-millisecond,
// immune to wall-clock adjustments), falling back to Date.now() in an
// environment without it (some older headless test shells).

export function now () {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}
