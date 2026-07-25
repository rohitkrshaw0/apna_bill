// shared/freezeDeep.js
// Same canonical deep-freeze as events/shared/freezeDeep.js and
// dataExchange/shared/freezeDeep.js, kept as its own copy here -- diagnostics/
// depends only on events/ (its public barrel), never on dataExchange/, and
// never reaches into another platform's shared/ folder for a one-function
// primitive (same rationale events/shared/freezeDeep.js already documents).

export function deepFreeze (value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
