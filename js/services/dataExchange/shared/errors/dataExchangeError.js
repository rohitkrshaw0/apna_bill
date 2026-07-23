// shared/errors/dataExchangeError.js
// The one structured error shape used throughout this framework -- never a
// raw thrown string. Every field is optional except message, so callers can
// add as much or as little context as they have.

import { deepFreeze } from '../freezeDeep.js';
import { SEVERITY } from '../severity.js';

/**
 * @param {object} fields
 * @param {string} fields.message
 * @param {string} [fields.code]
 * @param {string} [fields.severity] one of SEVERITY
 * @param {string} [fields.category] one of ERROR_CATEGORY
 * @param {string} [fields.entity] entity type this error concerns, if any
 * @param {string} [fields.field] field name this error concerns, if any
 * @param {string} [fields.suggestion] human-readable fix suggestion
 * @param {string} [fields.source] which module/stage raised this
 */
export function createDataExchangeError ({
  message, code = null, severity = SEVERITY.ERROR, category = null,
  entity = null, field = null, suggestion = null, source = null
} = {}) {
  return deepFreeze({ message, code, severity, category, entity, field, suggestion, source });
}
