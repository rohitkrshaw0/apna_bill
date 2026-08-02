// contracts/journalContract.js
// The immutable shape of a journal entry and its lines (Milestone 15A
// "Journal Contracts"). No persistence, no posting, no balance check --
// this file guarantees SHAPE. Accounting correctness is
// validation/journalEntryValidator.js's job, and the split is deliberate
// (see "WHY THE FACTORY DOES NOT BALANCE" below).
//
// ---------------------------------------------------------------------
// TWO NON-NEGATIVE FIELDS, NOT ONE SIGNED AMOUNT (ADR-0009)
// ---------------------------------------------------------------------
// A line carries `debit` and `credit`, each defaulting to 0 (not null),
// with an exactly-one-is-positive invariant enforced by the validator.
// The alternative -- one signed `amount` -- was rejected:
//
// 1. A signed amount cannot distinguish "no side chosen" from "zero". With
//    amount: 0, a line the caller forgot to fill in is silently legal and
//    silently balanced. With two fields, "no side" is a detectable,
//    nameable error (LINE_SIDE_MISSING). A representation that makes one
//    class of malformation undetectable defeats this milestone's purpose.
// 2. The sign convention becomes tribal knowledge every future consumer --
//    ledger screens, trial balance, GST returns, the Tally exporter -- has
//    to independently know. Two named fields carry the answer in the name.
// 3. It maps directly onto the eventual persistence shape and lets
//    Postgres enforce the same invariant:
//      check ((debit = 0) <> (credit = 0)), check (debit >= 0 and credit >= 0)
//    schema.sql already uses that <>-as-XOR idiom on invoice_attachments.
//    A signed column needs a separate side column, or has no natural check.
// 4. This repository's own signed-amount experiment is the cautionary
//    tale: dataExchange/xml/mapping/vouchers/salesVoucherMapper.js sums
//    Tally's signed LEDGERENTRIES into one figure, and the check over it
//    (xmlBusinessRules.js) degraded into a 0.5-rupee-tolerance warning.
//
// 0 rather than null for the unused side: sums need no null guards, it
// matches `not null default 0`, and null would add a third state
// ("not applicable") that buys nothing.
//
// Negative amounts are rejected outright -- a negative debit is a credit.
// Indian practice expresses contra movement with the opposite side, never
// a negative amount, and permitting one lets a "balanced" entry be
// assembled from nonsense.
//
// Each line stores BOTH representations, computed once at construction and
// frozen: debit/credit in rupees (what a future numeric(14,2) column
// holds) and debitMinor/creditMinor in canonical integer paise. It looks
// redundant; it means the two can never drift, and no validator or future
// consumer ever re-derives paise with a different rounding. See
// shared/money.js and ADR-0008.
//
// ---------------------------------------------------------------------
// WHY THE FACTORY DOES NOT BALANCE
// ---------------------------------------------------------------------
// createJournalEntry() deliberately does NOT run the balance check:
//   - balance validation takes optional injected collaborators (an account
//     registry, a fiscal period service) that a throwing single-argument
//     constructor cannot accept;
//   - it must report EVERY error, not the first;
//   - a future manual-voucher screen must be able to hold an unbalanced
//     draft entry and render exactly why it is unbalanced. If the
//     constructor refused to build it, that UI would need a parallel
//     un-validated shape.
//
// ---------------------------------------------------------------------
// createdBy IS CARRIED, VALIDATED, AND UNENFORCED
// ---------------------------------------------------------------------
// There is no roles/permissions model anywhere in this application to
// resolve or check an actor against. This is the identical situation
// reporting's `requiredCapability` is in; ADR-0003's reasoning applies
// unchanged and is not re-argued here. The field exists so the plumbing is
// real for whichever milestone adds a real identity model.

import { deepFreeze } from '../shared/freezeDeep.js';
import { generateId } from '../shared/generateId.js';
import { isIsoDateString } from '../shared/isoDate.js';
import { toMinorUnits } from '../shared/money.js';

/**
 * The document class a user recognises. Open string at validation time,
 * not membership-enforced -- same rule as accountContract's category.
 */
export const VOUCHER_TYPES = deepFreeze({
  SALES: 'sales',
  SALES_RETURN: 'salesReturn',
  PURCHASE: 'purchase',
  PURCHASE_RETURN: 'purchaseReturn',
  PAYMENT: 'payment',
  RECEIPT: 'receipt',
  CONTRA: 'contra',
  JOURNAL: 'journal',
  DEBIT_NOTE: 'debitNote',
  CREDIT_NOTE: 'creditNote',
  OPENING: 'opening',
  CLOSING: 'closing'
});

/**
 * Who produced the lines. NOT redundant with voucherType: voucherType is
 * the document class, postingSource records the origin. A journal typed by
 * a human ({ voucherType: 'journal', postingSource: 'manual' }) and one
 * generated by a year-end routine ({ voucherType: 'journal',
 * postingSource: 'adjustment' }) are the same document class with
 * completely different audit weight, and no voucherType value can express
 * that difference.
 */
export const POSTING_SOURCES = deepFreeze({
  MANUAL: 'manual',
  SALES: 'sales',
  PURCHASE: 'purchase',
  PAYMENT: 'payment',
  GST: 'gst',
  INVENTORY: 'inventory',
  MANUFACTURING: 'manufacturing',
  ADJUSTMENT: 'adjustment',
  IMPORT: 'import'
});

/**
 * @typedef {object} JournalLine
 * @property {string} accountId
 * @property {number} debit rupees, >= 0
 * @property {number} credit rupees, >= 0
 * @property {number} debitMinor canonical integer paise
 * @property {number} creditMinor canonical integer paise
 * @property {string|null} narration
 * @property {object} metadata
 */

/**
 * Shape only. The debit-XOR-credit rule is NOT enforced here: a line with
 * both sides zero is shape-valid but business-invalid, and it belongs in
 * the multi-error validator so a draft-voucher UI can hold and display it.
 * @param {object} fields
 * @returns {JournalLine}
 */
export function createJournalLine ({ accountId, debit = 0, credit = 0, narration = null, metadata = {} }) {
  if (!accountId || typeof accountId !== 'string') {
    throw new TypeError('createJournalLine: accountId is required');
  }
  if (typeof debit !== 'number') throw new TypeError('createJournalLine: debit must be a number');
  if (typeof credit !== 'number') throw new TypeError('createJournalLine: credit must be a number');
  if (narration !== null && narration !== undefined && (typeof narration !== 'string' || !narration)) {
    throw new TypeError('createJournalLine: narration must be a non-empty string when provided');
  }
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('createJournalLine: metadata must be a plain object');
  }

  // toMinorUnits enforces finite, non-negative, in-range, and
  // paise-representable -- so a negative or sub-paise amount is rejected
  // here, at construction, once.
  const debitMinor = toMinorUnits(debit);
  const creditMinor = toMinorUnits(credit);

  return deepFreeze({
    accountId,
    debit,
    credit,
    debitMinor,
    creditMinor,
    narration: narration || null,
    metadata: { ...metadata }
  });
}

/**
 * @typedef {object} JournalEntry
 * @property {string} id in-memory correlation handle -- NOT a persistence key
 * @property {string} date 'YYYY-MM-DD'
 * @property {string|null} narration
 * @property {string} voucherType one of VOUCHER_TYPES -- open string
 * @property {string} postingSource one of POSTING_SOURCES -- open string
 * @property {string|null} reference the source document number, if any
 * @property {string|null} fiscalPeriod a fiscal period id; NOT resolved here
 * @property {string|null} createdBy carried, validated, unenforced (see header)
 * @property {JournalLine[]} lines
 * @property {object} metadata
 */

/**
 * @param {object} fields `lines` accepts plain field objects; each is built
 *   through createJournalLine so errors originate in one place.
 * @returns {JournalEntry}
 */
export function createJournalEntry ({
  id = generateId('journalEntry'),
  date, narration = null, voucherType, postingSource,
  reference = null, fiscalPeriod = null, createdBy = null,
  lines = [], metadata = {}
}) {
  assertValidJournalEntryFields({ id, date, narration, voucherType, postingSource, reference, fiscalPeriod, createdBy, lines, metadata });

  const builtLines = lines.map((line, index) => {
    try {
      // Already-built frozen lines pass through their own factory again
      // harmlessly -- it is pure, and re-deriving the minor units from the
      // same rupee values is deterministic.
      return createJournalLine(line);
    } catch (error) {
      throw new TypeError(`createJournalEntry: line ${index} -- ${error.message}`);
    }
  });

  return deepFreeze({
    id,
    date,
    narration: narration || null,
    voucherType,
    postingSource,
    reference: reference || null,
    fiscalPeriod: fiscalPeriod || null,
    createdBy: createdBy || null,
    lines: builtLines,
    metadata: { ...metadata }
  });
}

function assertValidJournalEntryFields ({ id, date, narration, voucherType, postingSource, reference, fiscalPeriod, createdBy, lines, metadata }) {
  if (!id || typeof id !== 'string') throw new TypeError('createJournalEntry: id must be a non-empty string');
  if (!date || typeof date !== 'string') throw new TypeError('createJournalEntry: date is required');
  if (!isIsoDateString(date)) {
    throw new TypeError(`createJournalEntry: date must be a real calendar date in YYYY-MM-DD form, received "${date}"`);
  }
  if (!voucherType || typeof voucherType !== 'string') throw new TypeError('createJournalEntry: voucherType is required');
  if (!postingSource || typeof postingSource !== 'string') throw new TypeError('createJournalEntry: postingSource is required');

  for (const [label, value] of [['narration', narration], ['reference', reference], ['fiscalPeriod', fiscalPeriod], ['createdBy', createdBy]]) {
    if (value !== null && value !== undefined && (typeof value !== 'string' || !value)) {
      throw new TypeError(`createJournalEntry: ${label} must be a non-empty string when provided`);
    }
  }

  if (!Array.isArray(lines)) throw new TypeError('createJournalEntry: lines must be an array');
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('createJournalEntry: metadata must be a plain object');
  }
}

const REQUIRED_LINE_FIELDS = ['accountId', 'debit', 'credit', 'debitMinor', 'creditMinor', 'narration', 'metadata'];
const REQUIRED_ENTRY_FIELDS = ['id', 'date', 'narration', 'voucherType', 'postingSource', 'reference', 'fiscalPeriod', 'createdBy', 'lines', 'metadata'];

/**
 * Structural check -- key presence only. Distinct from validateJournalEntry(),
 * which checks accounting correctness. The same near-collision the frozen
 * Extension Framework already lives with (assertValidExtensionDefinition vs
 * validateExtension), kept for consistency with that precedent.
 * @param {JournalLine} line
 */
export function assertValidJournalLine (line) {
  if (!line || typeof line !== 'object') throw new TypeError('assertValidJournalLine: line must be an object');
  for (const key of REQUIRED_LINE_FIELDS) {
    if (!(key in line)) throw new TypeError(`assertValidJournalLine: missing "${key}"`);
  }
  return true;
}

/** @param {JournalEntry} entry */
export function assertValidJournalEntry (entry) {
  if (!entry || typeof entry !== 'object') throw new TypeError('assertValidJournalEntry: entry must be an object');
  for (const key of REQUIRED_ENTRY_FIELDS) {
    if (!(key in entry)) throw new TypeError(`assertValidJournalEntry: missing "${key}"`);
  }
  return true;
}
