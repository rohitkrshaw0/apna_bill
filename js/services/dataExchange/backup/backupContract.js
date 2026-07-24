// backup/backupContract.js
// Interfaces only -- no backup generation in this milestone.
//
// @typedef {Object} IBackupProvider
// @property {function(context): void} prepare
// @property {function(context): any} backup
// @property {function(any): ValidationResult} verify
// @property {function(): object} finalize

import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CODES, ERROR_CATEGORY } from '../shared/errors/index.js';

const REQUIRED_METHODS = ['prepare', 'backup', 'verify', 'finalize'];

export function assertValidBackupProvider (candidate) {
  const missing = REQUIRED_METHODS.filter(m => typeof candidate?.[m] !== 'function');
  if (missing.length) {
    throw createDataExchangeError({
      message: `Backup provider is missing required method(s): ${missing.join(', ')}`,
      code: ERROR_CODES.INVALID_CONTRACT,
      category: ERROR_CATEGORY.SYSTEM,
      source: 'backup/backupContract'
    });
  }
  return true;
}

export function createBaseBackupProvider (overrides = {}) {
  return {
    prepare: () => {},
    backup: () => { throw new Error('backup() not implemented'); },
    verify: () => { throw new Error('verify() not implemented'); },
    finalize: () => ({}),
    ...overrides
  };
}
