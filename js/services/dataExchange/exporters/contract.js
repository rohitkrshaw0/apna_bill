// exporters/contract.js
// The export-side format contract: converts database models into DTOs.
// Turning a DTO into an output string/file is a Formatter's job (see
// ../formatters/), not this contract's.
//
// @typedef {Object} IExporter
// @property {function(context): void} prepare   -- gather/validate what will be exported
// @property {function(): DTO[]} export           -- produce the DTOs
// @property {function(): AsyncIterable<DTO>} [stream] -- optional streaming variant for large exports
// @property {function(): object} finalize        -- cleanup / summary after export

import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CODES, ERROR_CATEGORY } from '../shared/errors/index.js';

const REQUIRED_METHODS = ['prepare', 'export', 'finalize'];

export function assertValidExporter (candidate) {
  const missing = REQUIRED_METHODS.filter(m => typeof candidate?.[m] !== 'function');
  if (missing.length) {
    throw createDataExchangeError({
      message: `Exporter is missing required method(s): ${missing.join(', ')}`,
      code: ERROR_CODES.INVALID_CONTRACT,
      category: ERROR_CATEGORY.SYSTEM,
      source: 'exporters/contract'
    });
  }
  return true;
}

export function createBaseExporter (overrides = {}) {
  return {
    prepare: () => {},
    export: () => [],
    stream: undefined,
    finalize: () => ({}),
    ...overrides
  };
}
