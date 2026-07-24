// migration/errorNormalization.js
// Generalizes the error-normalization pattern that, today, exists in
// exactly one of four pipelines (apnabillRestore.js) -- see the approved
// design §3.3. Any thrown value becomes this platform's own
// DataExchangeError shape; anything that already looks like one (has
// `category` and `severity`, e.g. a throw from apnabillRestoreProvider.js's
// own createDataExchangeError() calls) passes through unchanged, never
// double-wrapped.

import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CODES, ERROR_CATEGORY } from '../shared/errors/index.js';

export function isAlreadyNormalizedError (err) {
  return !!err && typeof err.message === 'string' && 'category' in err && 'severity' in err;
}

export function normalizeError (err, source) {
  if (isAlreadyNormalizedError(err)) return err;
  return createDataExchangeError({
    message: (err && err.message) || String(err),
    code: ERROR_CODES.INVALID_VALUE,
    category: ERROR_CATEGORY.SYSTEM,
    source
  });
}
