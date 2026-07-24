// xml/tallyXmlParser.js
// Implements 9A's parsers/contract.js IDataParser against Tally's native
// XML export format, using the browser's native DOMParser (no new
// dependency). See docs/milestone-9b-xml-mapping.md for the full mapping
// this parser's output feeds into.
//
// parse() is async (unlike the contract's illustrative sync JSDoc) so a
// single pass over <TALLYMESSAGE> nodes can yield back to the event loop
// every BATCH_SIZE records -- see the plan's "Streaming" section for why
// this, not a real streaming/SAX parser, is what's achievable with zero
// new dependencies. Every caller in this codebase awaits it either way.

import { checkXmlSecurity } from './security/xmlSecurity.js';
import { decodeXmlBuffer } from './encoding/detectEncoding.js';
import { createValidationResult } from '../validators/validationResult.js';
import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CATEGORY, ERROR_CODES } from '../shared/errors/index.js';
import { SEVERITY } from '../shared/severity.js';

const BATCH_SIZE = 200;

// Tags directly under <TALLYMESSAGE> that are recognized but have no
// ApnaBill equivalent -- collected as warnings, never imported, never
// treated as an "unrecognized" tag. See mapping doc section 2.
const KNOWN_UNSUPPORTED_TAGS = new Set([
  'CURRENCY', 'UNIT', 'COSTCATEGORY', 'INCOMETAXCLASSIFICATION',
  'INCOMETAXSLAB', 'TAXUNIT', 'VOUCHERTYPE', 'GODOWN'
]);
const KNOWN_IMPORTED_TAGS = new Set(['COMPANY', 'STOCKITEM', 'LEDGER', 'GROUP']);
const KNOWN_VOUCHER_TAGS = new Set(['VOUCHER']);

function err (message, extra = {}) {
  return createDataExchangeError({ message, code: ERROR_CODES.SCHEMA_MISMATCH, category: ERROR_CATEGORY.FILE, severity: SEVERITY.CRITICAL, source: 'xml/tallyXmlParser', ...extra });
}
function warn (message, extra = {}) {
  return createDataExchangeError({ message, category: ERROR_CATEGORY.SCHEMA, severity: SEVERITY.WARNING, source: 'xml/tallyXmlParser', ...extra });
}

// Tally's exporter emits numeric character references to control code
// points (observed: &#4; as a bullet marker on GSTAPPLICABLE and similar
// enum-like fields -- see mapping doc section 6) that the XML 1.0 spec
// itself forbids as Char values. A strict parser (this one included)
// rejects them outright ("invalid xmlChar"), so they're neutralized here --
// dropped, not decoded -- before the text ever reaches DOMParser. Only
// numeric refs that actually resolve to an illegal XML Char are touched;
// legal ones (e.g. &#8377; for Rs.) pass through untouched. This is a
// spec-driven fix for a documented Tally export defect, not a guess.
const CHAR_REF_RE = /&#(x?)([0-9A-Fa-f]+);/g;
function isIllegalXmlChar (codePoint) {
  if (codePoint === 0x9 || codePoint === 0xA || codePoint === 0xD) return false;
  if (codePoint >= 0x20 && codePoint <= 0xD7FF) return false;
  if (codePoint >= 0xE000 && codePoint <= 0xFFFD) return false;
  if (codePoint >= 0x10000 && codePoint <= 0x10FFFF) return false;
  return true;
}
function stripIllegalXmlCharRefs (text) {
  return text.replace(CHAR_REF_RE, (match, hexFlag, digits) => {
    const codePoint = parseInt(digits, hexFlag ? 16 : 10);
    return isIllegalXmlChar(codePoint) ? '' : match;
  });
}

function normalizeSource (source) {
  if (typeof source === 'string') {
    return { text: stripIllegalXmlCharRefs(source), fileName: null, byteLength: source.length, encoding: 'utf-8', hasBom: false };
  }
  const buffer = source instanceof ArrayBuffer ? source : source?.buffer;
  const fileName = source instanceof ArrayBuffer ? null : (source?.fileName || null);
  if (!buffer) throw new Error('tallyXmlParser: source must be a string, ArrayBuffer, or { buffer, fileName }');
  const decoded = decodeXmlBuffer(buffer);
  return { text: stripIllegalXmlCharRefs(decoded.text), fileName, byteLength: buffer.byteLength, encoding: decoded.encoding, hasBom: decoded.hasBom };
}

function elementToRecord (el) {
  const rec = {};
  for (const attr of Array.from(el.attributes || [])) {
    rec['@' + attr.name] = attr.value;
  }
  const childrenByTag = new Map();
  for (const child of Array.from(el.children)) {
    if (!childrenByTag.has(child.tagName)) childrenByTag.set(child.tagName, []);
    childrenByTag.get(child.tagName).push(child);
  }
  for (const [tag, children] of childrenByTag) {
    const isListTag = tag.endsWith('.LIST');
    const values = children.map(childToValue);
    rec[tag] = isListTag ? values : (values.length > 1 ? values : values[0]);
  }
  return rec;
}
function childToValue (el) {
  return el.children.length > 0 ? elementToRecord(el) : (el.textContent ?? '');
}

export function createTallyXmlParser () {
  let warnings = [];
  let errors = [];
  let metadata = {};

  function reset () { warnings = []; errors = []; metadata = {}; }

  function validate (source) {
    reset();
    let normalized;
    try {
      normalized = normalizeSource(source);
    } catch (e) {
      errors.push(err(e.message));
      return createValidationResult({ errors });
    }

    const securityErrors = checkXmlSecurity({ text: normalized.text, fileName: normalized.fileName, byteLength: normalized.byteLength });
    if (securityErrors.length) {
      errors.push(...securityErrors);
      return createValidationResult({ errors });
    }

    const doc = new DOMParser().parseFromString(normalized.text, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      errors.push(err(`Malformed XML: ${parserError.textContent.trim().slice(0, 300)}`));
      return createValidationResult({ errors });
    }

    const messages = doc.querySelectorAll('ENVELOPE > BODY > IMPORTDATA > REQUESTDATA > TALLYMESSAGE');
    if (!messages.length) {
      errors.push(err('Required envelope structure (ENVELOPE > BODY > IMPORTDATA > REQUESTDATA > TALLYMESSAGE) not found or empty'));
      return createValidationResult({ errors });
    }

    return createValidationResult({ errors, warnings });
  }

  async function parse (source) {
    reset();
    const normalized = normalizeSource(source);

    const securityErrors = checkXmlSecurity({ text: normalized.text, fileName: normalized.fileName, byteLength: normalized.byteLength });
    if (securityErrors.length) { errors.push(...securityErrors); return []; }

    const doc = new DOMParser().parseFromString(normalized.text, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) { errors.push(err(`Malformed XML: ${parserError.textContent.trim().slice(0, 300)}`)); return []; }

    const reportName = doc.querySelector('REQUESTDESC > REPORTNAME')?.textContent?.trim() || null;
    const svCompany = doc.querySelector('REQUESTDESC > STATICVARIABLES > SVCURRENTCOMPANY')?.textContent?.trim() || null;
    const messages = Array.from(doc.querySelectorAll('ENVELOPE > BODY > IMPORTDATA > REQUESTDATA > TALLYMESSAGE'));

    if (!messages.length) {
      errors.push(err('Required envelope structure (ENVELOPE > BODY > IMPORTDATA > REQUESTDATA > TALLYMESSAGE) not found or empty'));
      return [];
    }

    const knownAll = new Set([...KNOWN_IMPORTED_TAGS, ...KNOWN_UNSUPPORTED_TAGS, ...KNOWN_VOUCHER_TAGS]);
    const records = [];
    for (let i = 0; i < messages.length; i++) {
      const entityEl = messages[i].firstElementChild;
      if (!entityEl) continue;
      const tag = entityEl.tagName;

      if (!knownAll.has(tag)) {
        warnings.push(warn(`Unrecognized tag <${tag}> under <TALLYMESSAGE> -- skipped`, { field: tag }));
        continue;
      }
      if (KNOWN_UNSUPPORTED_TAGS.has(tag)) {
        warnings.push(warn(`<${tag}> is a known Tally tag with no ApnaBill equivalent -- skipped`, { field: tag }));
        continue;
      }

      const record = elementToRecord(entityEl);
      record.__xmlTag = tag;
      if (tag === 'VOUCHER') record.__vchType = record['@VCHTYPE'] || null;
      records.push(record);

      if ((i + 1) % BATCH_SIZE === 0) await Promise.resolve(); // yield to the event loop
    }

    const counts = {};
    for (const r of records) counts[r.__xmlTag] = (counts[r.__xmlTag] || 0) + 1;

    metadata = {
      sourceFormat: 'tally-xml',
      reportName,
      companyName: svCompany,
      encoding: normalized.encoding,
      hasBom: normalized.hasBom,
      recordCount: records.length,
      countsByTag: counts,
      generatedAt: null // Tally's export carries no generation timestamp
    };

    return records;
  }

  return {
    validate,
    parse,
    getMetadata: () => metadata,
    getWarnings: () => warnings,
    getErrors: () => errors
  };
}
