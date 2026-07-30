// shared/freezeDeep.js
// Same canonical deep-freeze as events/shared/, diagnostics/shared/,
// jobs/shared/, audit/shared/, and extensions/shared/ -- kept as its own
// copy, per this codebase's own convention: a platform never reaches into
// another platform's shared/ folder for a one-function primitive.
//
// Note: deepFreeze skips functions, so freezing a ReportDefinition never
// freezes its own hook/callback fields.

export function deepFreeze (value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
