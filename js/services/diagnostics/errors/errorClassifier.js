// errors/errorClassifier.js
// A reusable error model (Milestone 11C section "Error Classification").
// Deliberately independent of dataExchange/shared/errors/errorCategory.js's
// ERROR_CATEGORY (file/schema/business/relationship/reference/duplicate/
// conflict/system) -- that taxonomy models the Validation Pipeline's own
// stages and is specific to the Data Exchange platform; diagnostics
// observes the WHOLE application, not just one platform, and needs a
// broader, general-purpose taxonomy instead (exactly the five categories
// the brief names). Where a dataExchange-shaped error is encountered,
// classifyError() maps it by matching its `.category` STRING VALUE (never
// by importing dataExchange's module) -- this keeps diagnostics'
// dependency graph exactly "diagnostics depends on events, nothing else",
// per this milestone's own brief, while still classifying those errors
// sensibly rather than dumping them all into UNEXPECTED.

import { deepFreeze } from '../shared/freezeDeep.js';

export const ERROR_CATEGORIES = deepFreeze({
  VALIDATION: 'validation',
  BUSINESS: 'business',
  INFRASTRUCTURE: 'infrastructure',
  NETWORK: 'network',
  UNEXPECTED: 'unexpected'
});

// dataExchange's own category STRING VALUES (not its module) that map onto
// this platform's broader taxonomy -- see header comment for why this is a
// string-match, not an import.
const DATA_EXCHANGE_CATEGORY_MAP = {
  file: ERROR_CATEGORIES.VALIDATION,
  schema: ERROR_CATEGORIES.VALIDATION,
  relationship: ERROR_CATEGORIES.VALIDATION,
  reference: ERROR_CATEGORIES.VALIDATION,
  duplicate: ERROR_CATEGORIES.VALIDATION,
  conflict: ERROR_CATEGORIES.VALIDATION,
  business: ERROR_CATEGORIES.BUSINESS,
  system: ERROR_CATEGORIES.INFRASTRUCTURE
};

const NETWORK_HINT_PATTERN = /network|fetch|timeout|econn|offline|dns|xhr/i;

/**
 * Never throws, regardless of what is passed in (including `null`,
 * `undefined`, a plain string, or a frozen dataExchange-shaped object that
 * is not `instanceof Error`).
 * @param {*} error
 * @returns {string} one of ERROR_CATEGORIES
 */
export function classifyError (error) {
  if (error && typeof error === 'object') {
    if (typeof error.category === 'string' && DATA_EXCHANGE_CATEGORY_MAP[error.category]) {
      return DATA_EXCHANGE_CATEGORY_MAP[error.category];
    }
    const text = `${error.name || ''} ${error.message || ''} ${error.code || ''}`;
    if (NETWORK_HINT_PATTERN.test(text)) return ERROR_CATEGORIES.NETWORK;
    if (error.category === ERROR_CATEGORIES.VALIDATION || error.category === ERROR_CATEGORIES.BUSINESS) return error.category;
    if (error instanceof TypeError || error instanceof RangeError || error instanceof ReferenceError) {
      return ERROR_CATEGORIES.UNEXPECTED;
    }
  }
  return ERROR_CATEGORIES.UNEXPECTED;
}

/**
 * A small, structured, JSON-safe summary of any thrown value -- safe to log
 * or embed in a timeline entry (never returns the original object, so a
 * consumer can never accidentally mutate what was thrown).
 * @param {*} error
 * @returns {{message: string, category: string, code: string|null, name: string|null}}
 */
export function describeError (error) {
  if (error === null || error === undefined) {
    return { message: 'Unknown error', category: ERROR_CATEGORIES.UNEXPECTED, code: null, name: null };
  }
  if (typeof error === 'string') {
    return { message: error, category: classifyError(error), code: null, name: null };
  }
  return {
    message: error.message || String(error),
    category: classifyError(error),
    code: error.code || null,
    name: error.name || null
  };
}
