// shared/freezeDeep.js
// Same canonical deep-freeze as events/shared/freezeDeep.js and
// diagnostics/shared/freezeDeep.js, kept as its own copy -- jobs/ depends
// only on events/ and diagnostics/ (their public barrels), never on
// dataExchange/ or any business file, and never reaches into another
// platform's shared/ folder for a one-function primitive.
//
// Note: deepFreeze skips functions (typeof fn === 'function', not
// 'object'), so freezing a JobDefinition never freezes its own `handler`.

export function deepFreeze (value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
