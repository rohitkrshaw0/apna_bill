// transactions/transactionEngine.js
// A unit-of-work style atomic execution engine. There's no real database
// transaction primitive at this layer (no DB calls here, per this
// milestone's scope) -- instead, each executed step registers its own undo
// callback, and rollback() runs them in reverse (LIFO), same effect as a DB
// ROLLBACK for whatever a future Supabase-backed importer wires in. Ensures
// no import is ever left partially applied.

import { createErrorCollector } from '../shared/errors/errorCollector.js';
import { TRANSACTION_STATE } from './transactionState.js';

export function createTransactionEngine ({ logger = null } = {}) {
  let state = TRANSACTION_STATE.PENDING;
  let rollbackSteps = [];
  let progressTracker = null;
  const collector = createErrorCollector();

  function begin () {
    state = TRANSACTION_STATE.ACTIVE;
    rollbackSteps = [];
    logger?.info('Transaction started');
  }

  function registerRollbackStep (fn) {
    if (state !== TRANSACTION_STATE.ACTIVE) throw new Error('Cannot register a rollback step outside an active transaction');
    rollbackSteps.push(fn);
  }

  function commit () {
    state = TRANSACTION_STATE.COMMITTED;
    rollbackSteps = [];
    logger?.info('Transaction committed');
  }

  function rollback () {
    let failed = false;
    for (const step of rollbackSteps.slice().reverse()) {
      try { step(); }
      catch (err) { failed = true; logger?.error('Rollback step failed', err); }
    }
    rollbackSteps = [];
    state = failed ? TRANSACTION_STATE.FAILED : TRANSACTION_STATE.ROLLED_BACK;
    logger?.warn(`Transaction rolled back (${state})`);
  }

  return {
    begin,
    registerRollbackStep,
    commit,
    rollback,
    trackProgress: (tracker) => { progressTracker = tracker; },
    collectErrors: (error) => collector.add(error),
    collectWarnings: (warning) => collector.add(warning),
    getErrors: () => collector.getErrors(),
    getWarnings: () => collector.getWarnings(),
    getState: () => state,
    getProgressTracker: () => progressTracker
  };
}
