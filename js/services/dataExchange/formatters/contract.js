// formatters/contract.js
// The export-side DTO -> output contract (XML text, CSV text, a
// worksheet, a JSON string, ...). Never invoked from an Exporter directly;
// the export/ orchestration layer wires Exporter -> Formatter -> Output.
//
// @typedef {Object} IFormatter
// @property {function(DTO[]): any} format -- produce the format-specific output

import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CODES, ERROR_CATEGORY } from '../shared/errors/index.js';

const REQUIRED_METHODS = ['format'];

export function assertValidFormatter (candidate) {
  const missing = REQUIRED_METHODS.filter(m => typeof candidate?.[m] !== 'function');
  if (missing.length) {
    throw createDataExchangeError({
      message: `Formatter is missing required method(s): ${missing.join(', ')}`,
      code: ERROR_CODES.INVALID_CONTRACT,
      category: ERROR_CATEGORY.SYSTEM,
      source: 'formatters/contract'
    });
  }
  return true;
}

export function createBaseFormatter (overrides = {}) {
  return {
    format: () => { throw new Error('format() not implemented'); },
    ...overrides
  };
}
