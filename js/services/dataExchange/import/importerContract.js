// import/importerContract.js
// The contract the final pipeline stage (Importer) implements: takes an
// ImportPlan and drives it through the TransactionEngine, reporting
// through a ProgressTracker. No format/entity knowledge here.
//
// @typedef {Object} IImporter
// @property {function(context): void} prepare
// @property {function(plan, {transactionEngine, progressTracker}): void} run
// @property {function(): object} getResult

import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CODES, ERROR_CATEGORY } from '../shared/errors/index.js';

const REQUIRED_METHODS = ['prepare', 'run', 'getResult'];

export function assertValidImporter (candidate) {
  const missing = REQUIRED_METHODS.filter(m => typeof candidate?.[m] !== 'function');
  if (missing.length) {
    throw createDataExchangeError({
      message: `Importer is missing required method(s): ${missing.join(', ')}`,
      code: ERROR_CODES.INVALID_CONTRACT,
      category: ERROR_CATEGORY.SYSTEM,
      source: 'import/importerContract'
    });
  }
  return true;
}

export function createBaseImporter (overrides = {}) {
  return {
    prepare: () => {},
    run: () => { throw new Error('run() not implemented'); },
    getResult: () => ({}),
    ...overrides
  };
}
