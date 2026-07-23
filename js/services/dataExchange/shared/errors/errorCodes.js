// shared/errors/errorCodes.js
// A small, generic starter registry -- format- and entity-agnostic. Future
// parsers/validators may use these directly for common cases, or define
// their own codes; this list isn't meant to be exhaustive.

import { deepFreeze } from '../freezeDeep.js';

export const ERROR_CODES = deepFreeze({
  REQUIRED_FIELD: 'E_REQUIRED_FIELD',
  INVALID_VALUE: 'E_INVALID_VALUE',
  SCHEMA_MISMATCH: 'E_SCHEMA_MISMATCH',
  REFERENCE_NOT_FOUND: 'E_REFERENCE_NOT_FOUND',
  DUPLICATE_RECORD: 'E_DUPLICATE_RECORD',
  UNRESOLVED_CONFLICT: 'E_UNRESOLVED_CONFLICT',
  CYCLE_DETECTED: 'E_CYCLE_DETECTED',
  INVALID_CONTRACT: 'E_INVALID_CONTRACT'
});
