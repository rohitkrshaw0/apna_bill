// shared/freezeDeep.js
// Same canonical deep-freeze as events/, diagnostics/, and jobs/'s own
// copies -- audit/ depends only on events/ and diagnostics/ (their public
// barrels), never on jobs/ or dataExchange/ or any business file, and
// never reaches into another platform's shared/ folder for a
// one-function primitive.

export function deepFreeze (value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
