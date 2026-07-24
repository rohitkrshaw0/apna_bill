// migration/rollbackStrategies.js
// Names and selects the three rollback mechanisms that already exist in
// this platform (approved design §14) -- it does NOT invent a fourth or
// collapse them into one:
//
//   'lifo'      -- xmlImporter.js's existing model: many independent writes,
//                  each registers its own undo callback, failure triggers
//                  reverse-order undo. Reuses transactions/transactionEngine.js
//                  completely unchanged -- this factory is a thin selector,
//                  not a reimplementation.
//   'delegated' -- apnabillRestore.js's existing model: the adapter's own
//                  write is already one atomic operation (a single RPC
//                  backed by a real DB transaction); there is nothing here
//                  to roll back, by design, not by omission.
//   'none'      -- apnabillBackup.js's existing model: a read-only (or
//                  read-plus-one-audit-insert) operation with nothing to
//                  roll back in the first place.
//
// 'delegated' and 'none' are mechanically identical (both no-op) but kept
// as separate, named factories for the semantic reason the design doc
// gives: they answer different questions ("this was already handled
// atomically elsewhere" vs. "there was never anything to undo"), and a
// future reader should be able to tell which is true for a given adapter
// without reading its whole implementation.

import { createTransactionEngine } from '../transactions/transactionEngine.js';

export function createLifoRollbackStrategy (opts = {}) {
  return createTransactionEngine(opts);
}

function createNoopStrategy (stateLabel) {
  const errors = [];
  const warnings = [];
  return {
    begin: () => {},
    registerRollbackStep: () => {},
    commit: () => {},
    rollback: () => {},
    trackProgress: () => {},
    collectErrors: (e) => errors.push(e),
    collectWarnings: (w) => warnings.push(w),
    getErrors: () => errors,
    getWarnings: () => warnings,
    getState: () => stateLabel,
    getProgressTracker: () => null
  };
}

export function createDelegatedRollbackStrategy () { return createNoopStrategy('delegated'); }
export function createNoRollbackStrategy () { return createNoopStrategy('none'); }
