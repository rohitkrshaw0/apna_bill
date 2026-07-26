// shared/freezeDeep.js
// Same canonical deep-freeze as events/shared/freezeDeep.js,
// diagnostics/shared/freezeDeep.js, jobs/shared/freezeDeep.js, and
// audit/shared/freezeDeep.js, kept as its own copy here -- businessIntelligence/
// depends only on events/, diagnostics/, jobs/, audit/, and extensions/'s
// public barrels, never on another platform's shared/ folder for a
// one-function primitive (same rationale every prior platform's own copy
// already documents).

export function deepFreeze (value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
