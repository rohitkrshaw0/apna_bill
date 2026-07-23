// parsers/contract.js
// The import-side format contract every future parser (XML/CSV/Excel/
// JSON/ERP) must implement. No format knowledge lives here -- this is the
// shape, not an implementation.
//
// @typedef {Object} IDataParser
// @property {function(source): ValidationResult} validate  -- check the raw source is well-formed
// @property {function(source): DTO[]} parse                -- convert raw source into internal DTOs
// @property {function(): object} getMetadata                -- info about the parsed source (e.g. format, record count)
// @property {function(): DataExchangeError[]} getWarnings
// @property {function(): DataExchangeError[]} getErrors

import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CODES, ERROR_CATEGORY } from '../shared/errors/index.js';

const REQUIRED_METHODS = ['validate', 'parse', 'getMetadata', 'getWarnings', 'getErrors'];

export function assertValidParser (candidate) {
  const missing = REQUIRED_METHODS.filter(m => typeof candidate?.[m] !== 'function');
  if (missing.length) {
    throw createDataExchangeError({
      message: `Parser is missing required method(s): ${missing.join(', ')}`,
      code: ERROR_CODES.INVALID_CONTRACT,
      category: ERROR_CATEGORY.SYSTEM,
      source: 'parsers/contract'
    });
  }
  return true;
}

// Default no-op scaffolding a concrete format parser spreads in and
// overrides `validate`/`parse` on -- composition, not inheritance.
export function createBaseParser (overrides = {}) {
  return {
    validate: () => { throw new Error('validate() not implemented'); },
    parse: () => { throw new Error('parse() not implemented'); },
    getMetadata: () => ({}),
    getWarnings: () => [],
    getErrors: () => [],
    ...overrides
  };
}
