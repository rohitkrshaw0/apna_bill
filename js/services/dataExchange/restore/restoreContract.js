// restore/restoreContract.js
// Interfaces only -- no restore execution in this milestone.
//
// @typedef {Object} IRestoreProvider
// @property {function(version): ValidationResult} validateVersion
// @property {function(schema): ValidationResult} validateSchema
// @property {function(version, minCompatible): boolean} validateCompatibility
// @property {function(backup): PreviewModel} preview
// @property {function(backup): any} restore
// @property {function(): void} rollback

import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CODES, ERROR_CATEGORY } from '../shared/errors/index.js';

const REQUIRED_METHODS = ['validateVersion', 'validateSchema', 'validateCompatibility', 'preview', 'restore', 'rollback'];

export function assertValidRestoreProvider (candidate) {
  const missing = REQUIRED_METHODS.filter(m => typeof candidate?.[m] !== 'function');
  if (missing.length) {
    throw createDataExchangeError({
      message: `Restore provider is missing required method(s): ${missing.join(', ')}`,
      code: ERROR_CODES.INVALID_CONTRACT,
      category: ERROR_CATEGORY.SYSTEM,
      source: 'restore/restoreContract'
    });
  }
  return true;
}

export function createBaseRestoreProvider (overrides = {}) {
  return {
    validateVersion: () => { throw new Error('validateVersion() not implemented'); },
    validateSchema: () => { throw new Error('validateSchema() not implemented'); },
    validateCompatibility: () => { throw new Error('validateCompatibility() not implemented'); },
    preview: () => { throw new Error('preview() not implemented'); },
    restore: () => { throw new Error('restore() not implemented'); },
    rollback: () => { throw new Error('rollback() not implemented'); },
    ...overrides
  };
}
