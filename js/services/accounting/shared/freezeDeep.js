// shared/freezeDeep.js
// Same canonical deep-freeze as events/shared/, diagnostics/shared/,
// jobs/shared/, audit/shared/, extensions/shared/, and reporting/shared/ --
// kept as its own copy, per this codebase's own convention: a platform
// never reaches into another platform's shared/ folder for a one-function
// primitive.
//
// Note: deepFreeze skips functions, so freezing a PostingProviderDefinition
// never freezes its own buildJournalEntry callback.
//
// Internal primitive -- deliberately NOT re-exported from this platform's
// index.js. Only the accounting contracts/registries/validators are public
// API; see docs/architecture/accounting-platform-architecture.md
// §"Public API surface".

export function deepFreeze (value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
