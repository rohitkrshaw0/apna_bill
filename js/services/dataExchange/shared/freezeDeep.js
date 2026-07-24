// shared/freezeDeep.js
// Single canonical deep-freeze used by the DTO layer and every enum in this
// framework, so immutability isn't reimplemented per module.

export function deepFreeze (value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
