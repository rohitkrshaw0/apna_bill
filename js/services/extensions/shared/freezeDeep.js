// shared/freezeDeep.js
// Same canonical deep-freeze as events/, diagnostics/, jobs/, and audit/'s
// own copies -- extensions/ depends only on events/, diagnostics/, jobs/,
// and audit/ (their public barrels), never on dataExchange/ or any
// business file, and never reaches into another platform's shared/
// folder for a one-function primitive.
//
// Note: deepFreeze skips functions, so freezing an ExtensionDefinition
// never freezes its own `hooks.onInitialize`/etc.

export function deepFreeze (value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
