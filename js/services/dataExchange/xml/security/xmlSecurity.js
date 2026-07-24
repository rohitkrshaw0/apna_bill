// xml/security/xmlSecurity.js
// Cheapest-possible-point XXE/Billion-Laughs closure: real Tally exports
// never contain a DOCTYPE or ENTITY declaration, so rejecting both outright
// (before any DOM parsing) is strictly safe, not a compatibility risk.

import { createDataExchangeError } from '../../shared/errors/dataExchangeError.js';
import { ERROR_CATEGORY, ERROR_CODES } from '../../shared/errors/index.js';
import { SEVERITY } from '../../shared/severity.js';

export const MAX_XML_BYTES = 100 * 1024 * 1024; // 100MB — supplied samples are 620KB/349KB

const DOCTYPE_RE = /<!DOCTYPE/i;
const ENTITY_RE = /<!ENTITY/i;

function fileErr (message, extra = {}) {
  return createDataExchangeError({
    message, code: ERROR_CODES.INVALID_VALUE, category: ERROR_CATEGORY.FILE,
    severity: SEVERITY.CRITICAL, source: 'xml/security', ...extra
  });
}

/**
 * @param {object} opts { text, fileName, byteLength }
 * @returns {DataExchangeError[]} empty when the source passes every check
 */
export function checkXmlSecurity ({ text = '', fileName = null, byteLength = null } = {}) {
  const errors = [];

  if (fileName != null && !/\.xml$/i.test(fileName)) {
    errors.push(fileErr(`File "${fileName}" does not have a .xml extension`));
  }

  const size = byteLength != null ? byteLength : text.length;
  if (size > MAX_XML_BYTES) {
    errors.push(fileErr(`File is ${size} bytes, exceeding the ${MAX_XML_BYTES}-byte cap`,
      { suggestion: 'Split the export into smaller files' }));
  }

  if (DOCTYPE_RE.test(text)) {
    errors.push(fileErr('XML contains a <!DOCTYPE declaration — rejected to prevent XXE/billion-laughs attacks',
      { suggestion: 'Real Tally exports never include a DOCTYPE; re-export from Tally' }));
  }
  if (ENTITY_RE.test(text)) {
    errors.push(fileErr('XML contains an <!ENTITY declaration — rejected to prevent XXE/billion-laughs attacks'));
  }

  return errors;
}
