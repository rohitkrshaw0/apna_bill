// validation/validationResult.js
// The one result shape every accounting business-rule validator returns
// (Milestone 15A "Validation framework").
//
// The { isValid, errors: [{ code, message, ...details }] } shape and the
// `[CODE] message` formatting are taken verbatim from
// extensions/validation/dependencyValidator.js, which already established
// both in this repository. This file exists so the three validators that
// share the shape (journal entry, and whatever 15B adds) construct it one
// way rather than re-inlining it.
//
// Why a result object rather than a throw is argued in
// validation/journalEntryValidator.js's own header and recorded in
// ADR-0011 -- in short: contract construction throws because a malformed
// definition is a programmer error, while business-rule validation returns
// a result because an unbalanced voucher is ordinary human input that
// fails several rules at once and needs machine-mappable codes.
//
// createValidationError/createValidationResult are internal construction
// helpers and are NOT re-exported from index.js -- a consumer reads the
// result, it does not build one. formatValidationErrors IS public: a
// caller that wants to log or display a failed validation needs it.

import { deepFreeze } from '../shared/freezeDeep.js';

/**
 * @param {{code: string, message: string}} fields plus any rule-specific details
 * @returns {object} frozen
 */
export function createValidationError ({ code, message, ...details }) {
  if (!code || typeof code !== 'string') throw new TypeError('createValidationError: code is required');
  if (!message || typeof message !== 'string') throw new TypeError('createValidationError: message is required');
  return deepFreeze({ code, message, ...details });
}

/**
 * @param {object[]} errors
 * @returns {{isValid: boolean, errors: object[]}} frozen
 */
export function createValidationResult (errors) {
  if (!Array.isArray(errors)) throw new TypeError('createValidationResult: errors must be an array');
  return deepFreeze({ isValid: errors.length === 0, errors: [...errors] });
}

/**
 * @param {object[]} errors
 * @returns {string} e.g. '[UNBALANCED] debits 100.00 != credits 90.00; [MINIMUM_LINES] ...'
 */
export function formatValidationErrors (errors) {
  if (!Array.isArray(errors)) return '';
  return errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
}
