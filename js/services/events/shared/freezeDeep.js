// shared/freezeDeep.js
// Same canonical deep-freeze as dataExchange/shared/freezeDeep.js, kept as its
// own copy here rather than imported cross-platform -- events/ is meant to be
// usable by any module in the app, including ones that know nothing about
// dataExchange, so it deliberately owns its own zero-dependency copy of this
// one-function primitive instead of reaching across a platform boundary for it.

export function deepFreeze (value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
