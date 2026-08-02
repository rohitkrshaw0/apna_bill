// validation/journalEntryValidator.js
// Accounting-correctness validation for a journal entry (Milestone 15A
// "Balanced Entry Validation"). contracts/journalContract.js guarantees
// SHAPE; this file guarantees the entry is a legal double-entry record.
//
// ---------------------------------------------------------------------
// THROW VS. { isValid, errors } -- BOTH, SPLIT BY KIND OF FAILURE (ADR-0011)
// ---------------------------------------------------------------------
// Two precedents already live in this repository, and they are not in
// conflict -- they answer different questions:
//
//   - Contract construction throws TypeError (createAccountDefinition,
//     createJournalEntry, every assertValidX). A malformed definition is a
//     PROGRAMMER ERROR -- a number where a string goes -- and every
//     platform in this repo makes that loud and immediate.
//
//   - Business-rule validation returns { isValid, errors }
//     (extensions/validation/dependencyValidator.js's own shape, reused
//     via validation/validationResult.js). An unbalanced voucher is
//     ordinary USER INPUT, not a bug: it can fail several independent
//     rules at once (unbalanced AND has an unknown account AND is missing
//     a side on one line), and a future manual-voucher screen needs every
//     one of those, with a machine-mappable code per line -- not the first
//     one re-thrown after each fix.
//
// assertBalancedJournalEntry() bridges the two so neither call site
// duplicates logic: a fail-fast caller (a future posting engine that must
// never persist an unbalanced entry) gets one throwing call; a UI gets the
// structured result.
//
// ---------------------------------------------------------------------
// CODES ARE SCREAMING_SNAKE, DOMAIN VALUES ARE lowerCamel -- ON PURPOSE
// ---------------------------------------------------------------------
// JOURNAL_ERROR_CODES values are SCREAMING_SNAKE (dependencyValidator.js's
// convention); VOUCHER_TYPES/POSTING_SOURCES values are lowerCamel
// (reportContract.js's convention). Both are live precedents in this
// repository; do not "fix" one to match the other.
//
// ---------------------------------------------------------------------
// ACCOUNT REGISTRY AND FISCAL PERIOD SERVICE ARE OPTIONAL COLLABORATORS
// ---------------------------------------------------------------------
// Both default to null. The validator must work on a bare entry with no
// registry at all -- unit tests, and a future import pipeline validating
// shape before a chart of accounts is even loaded. Making either mandatory
// would make the validator unusable in exactly the contexts where it is
// most useful.

import { createValidationError, createValidationResult, formatValidationErrors } from './validationResult.js';
import { canPostToPeriod, isDateWithinPeriod } from '../fiscal/fiscalPeriodContract.js';
import { ACCOUNT_STATUS } from '../contracts/accountContract.js';
import { sumMinorUnits, fromMinorUnits } from '../shared/money.js';

export const JOURNAL_ERROR_CODES = Object.freeze({
  MINIMUM_LINES: 'MINIMUM_LINES',
  LINE_SIDE_MISSING: 'LINE_SIDE_MISSING',
  LINE_SIDE_BOTH: 'LINE_SIDE_BOTH',
  NEGATIVE_AMOUNT: 'NEGATIVE_AMOUNT',
  UNBALANCED: 'UNBALANCED',
  DUPLICATE_ACCOUNT: 'DUPLICATE_ACCOUNT',
  UNKNOWN_ACCOUNT: 'UNKNOWN_ACCOUNT',
  INACTIVE_ACCOUNT: 'INACTIVE_ACCOUNT',
  PERIOD_NOT_OPEN: 'PERIOD_NOT_OPEN',
  DATE_OUTSIDE_PERIOD: 'DATE_OUTSIDE_PERIOD'
});

/**
 * @param {import('../contracts/journalContract.js').JournalEntry} entry
 * @returns {{debitMinor: number, creditMinor: number, debit: number, credit: number, differenceMinor: number, difference: number}}
 *   *Minor fields are the machine-checkable integer truth; debit/credit/difference are
 *   rupee views, for display and error messages only.
 */
export function computeEntryTotals (entry) {
  const debitMinor = sumMinorUnits(entry.lines.map((line) => line.debitMinor));
  const creditMinor = sumMinorUnits(entry.lines.map((line) => line.creditMinor));
  return {
    debitMinor,
    creditMinor,
    debit: fromMinorUnits(debitMinor),
    credit: fromMinorUnits(creditMinor),
    differenceMinor: debitMinor - creditMinor,
    difference: fromMinorUnits(debitMinor - creditMinor)
  };
}

/**
 * Exact integer equality -- no epsilon anywhere in the balance path. See
 * shared/money.js and ADR-0008.
 * @param {import('../contracts/journalContract.js').JournalEntry} entry
 * @returns {boolean}
 */
export function isBalanced (entry) {
  return computeEntryTotals(entry).differenceMinor === 0;
}

/**
 * @param {import('../contracts/journalContract.js').JournalEntry} entry
 * @returns {Array<{lineIndex: number, code: string, accountId: string}>}
 */
export function findLineSideErrors (entry) {
  const errors = [];
  entry.lines.forEach((line, lineIndex) => {
    const hasDebit = line.debitMinor > 0;
    const hasCredit = line.creditMinor > 0;
    if (line.debitMinor < 0 || line.creditMinor < 0) {
      errors.push({ lineIndex, code: JOURNAL_ERROR_CODES.NEGATIVE_AMOUNT, accountId: line.accountId });
    } else if (hasDebit && hasCredit) {
      errors.push({ lineIndex, code: JOURNAL_ERROR_CODES.LINE_SIDE_BOTH, accountId: line.accountId });
    } else if (!hasDebit && !hasCredit) {
      errors.push({ lineIndex, code: JOURNAL_ERROR_CODES.LINE_SIDE_MISSING, accountId: line.accountId });
    }
  });
  return errors;
}

/**
 * Duplicate accountId across lines. NOT an error by default -- see
 * validateJournalEntry's own comment on allowDuplicateAccounts. Exported
 * unconditionally so a future manual-voucher UI can render a warning
 * without failing the entry.
 * @param {import('../contracts/journalContract.js').JournalEntry} entry
 * @returns {Array<{accountId: string, lineIndexes: number[], sides: string[]}>}
 */
export function findDuplicateAccounts (entry) {
  const byAccount = new Map();
  entry.lines.forEach((line, lineIndex) => {
    if (!byAccount.has(line.accountId)) byAccount.set(line.accountId, { lineIndexes: [], sides: [] });
    const bucket = byAccount.get(line.accountId);
    bucket.lineIndexes.push(lineIndex);
    bucket.sides.push(line.debitMinor > 0 ? 'debit' : 'credit');
  });
  return [...byAccount.entries()]
    .filter(([, bucket]) => bucket.lineIndexes.length > 1)
    .map(([accountId, bucket]) => ({ accountId, lineIndexes: bucket.lineIndexes, sides: bucket.sides }));
}

/**
 * @param {import('../contracts/journalContract.js').JournalEntry} entry
 * @param {ReturnType<import('../registry/accountRegistry.js').createAccountRegistry>} accountRegistry
 * @returns {Array<{lineIndex: number, accountId: string}>}
 */
export function findUnknownAccounts (entry, accountRegistry) {
  const errors = [];
  entry.lines.forEach((line, lineIndex) => {
    if (!accountRegistry.get(line.accountId)) {
      errors.push({ lineIndex, accountId: line.accountId });
    }
  });
  return errors;
}

/**
 * @param {import('../contracts/journalContract.js').JournalEntry} entry
 * @param {ReturnType<import('../registry/accountRegistry.js').createAccountRegistry>} accountRegistry
 * @returns {Array<{lineIndex: number, accountId: string, status: string}>}
 */
export function findInactiveAccounts (entry, accountRegistry) {
  const errors = [];
  entry.lines.forEach((line, lineIndex) => {
    const account = accountRegistry.get(line.accountId);
    if (account && account.status !== ACCOUNT_STATUS.ACTIVE) {
      errors.push({ lineIndex, accountId: line.accountId, status: account.status });
    }
  });
  return errors;
}

/**
 * @param {import('../contracts/journalContract.js').JournalEntry} entry
 * @param {object} [options]
 * @param {ReturnType<import('../registry/accountRegistry.js').createAccountRegistry>|null} [options.accountRegistry]
 *   optional -- when supplied, checked for UNKNOWN_ACCOUNT / INACTIVE_ACCOUNT
 * @param {ReturnType<import('../fiscal/fiscalPeriodService.js').createFiscalPeriodService>|null} [options.fiscalPeriodService]
 *   optional -- when supplied AND entry.fiscalPeriod is set, checked for PERIOD_NOT_OPEN / DATE_OUTSIDE_PERIOD
 * @param {number} [options.minimumLines] default 2. Configurable: a future importer
 *   reconciling a legacy single-sided opening balance may need 1 temporarily.
 * @param {boolean} [options.allowDuplicateAccounts] default true -- see below
 * @returns {{isValid: boolean, errors: object[]}}
 */
export function validateJournalEntry (entry, {
  accountRegistry = null,
  fiscalPeriodService = null,
  minimumLines = 2,
  allowDuplicateAccounts = true
} = {}) {
  const errors = [];

  if (!entry || !Array.isArray(entry.lines)) {
    return createValidationResult([
      createValidationError({ code: JOURNAL_ERROR_CODES.MINIMUM_LINES, message: 'entry has no lines array' })
    ]);
  }

  if (entry.lines.length < minimumLines) {
    errors.push(createValidationError({
      code: JOURNAL_ERROR_CODES.MINIMUM_LINES,
      message: `a journal entry needs at least ${minimumLines} lines, received ${entry.lines.length}`,
      minimumLines,
      actualLines: entry.lines.length
    }));
  }

  for (const lineError of findLineSideErrors(entry)) {
    const messages = {
      [JOURNAL_ERROR_CODES.LINE_SIDE_BOTH]: `line ${lineError.lineIndex} (account "${lineError.accountId}") has both a debit and a credit -- a line may only have one`,
      [JOURNAL_ERROR_CODES.LINE_SIDE_MISSING]: `line ${lineError.lineIndex} (account "${lineError.accountId}") has neither a debit nor a credit`,
      [JOURNAL_ERROR_CODES.NEGATIVE_AMOUNT]: `line ${lineError.lineIndex} (account "${lineError.accountId}") has a negative amount`
    };
    errors.push(createValidationError({ code: lineError.code, message: messages[lineError.code], lineIndex: lineError.lineIndex, accountId: lineError.accountId }));
  }

  // Balance is only meaningful once every line has exactly one side --
  // computeEntryTotals sums debitMinor/creditMinor regardless, so a
  // LINE_SIDE_MISSING line (0/0) or a LINE_SIDE_BOTH line contributes to
  // both sides and would produce a misleading second error. Skip it when
  // any line-side error already fired; the line-side error is the
  // actionable one.
  const hasLineSideErrors = errors.some((e) =>
    e.code === JOURNAL_ERROR_CODES.LINE_SIDE_BOTH ||
    e.code === JOURNAL_ERROR_CODES.LINE_SIDE_MISSING ||
    e.code === JOURNAL_ERROR_CODES.NEGATIVE_AMOUNT
  );
  if (!hasLineSideErrors && !isBalanced(entry)) {
    const totals = computeEntryTotals(entry);
    errors.push(createValidationError({
      code: JOURNAL_ERROR_CODES.UNBALANCED,
      message: `debits ${totals.debit.toFixed(2)} do not equal credits ${totals.credit.toFixed(2)} (difference ${totals.difference.toFixed(2)})`,
      ...totals
    }));
  }

  // Duplicate accounts are ALLOWED BY DEFAULT. A payment voucher settling
  // two invoices against the same party account with distinct narrations
  // is standard practice; forbidding duplicates would reject legitimate
  // vouchers. Only emitted as an error when a caller opts in.
  if (!allowDuplicateAccounts) {
    for (const dup of findDuplicateAccounts(entry)) {
      errors.push(createValidationError({
        code: JOURNAL_ERROR_CODES.DUPLICATE_ACCOUNT,
        message: `account "${dup.accountId}" appears on ${dup.lineIndexes.length} lines`,
        ...dup
      }));
    }
  }

  if (accountRegistry) {
    for (const unknown of findUnknownAccounts(entry, accountRegistry)) {
      errors.push(createValidationError({
        code: JOURNAL_ERROR_CODES.UNKNOWN_ACCOUNT,
        message: `line ${unknown.lineIndex} references account "${unknown.accountId}", which is not registered`,
        ...unknown
      }));
    }
    for (const inactive of findInactiveAccounts(entry, accountRegistry)) {
      errors.push(createValidationError({
        code: JOURNAL_ERROR_CODES.INACTIVE_ACCOUNT,
        message: `line ${inactive.lineIndex} references account "${inactive.accountId}", which is ${inactive.status}`,
        ...inactive
      }));
    }
  }

  // Fiscal period rules live in fiscal/fiscalPeriodContract.js
  // (canPostToPeriod, isDateWithinPeriod); this validator only calls them.
  // That keeps the dependency one-directional -- validation depends on
  // fiscal, fiscal never depends on validation -- and entirely optional.
  if (fiscalPeriodService && entry.fiscalPeriod) {
    const period = fiscalPeriodService.get(entry.fiscalPeriod);
    if (period) {
      if (!canPostToPeriod(period)) {
        errors.push(createValidationError({
          code: JOURNAL_ERROR_CODES.PERIOD_NOT_OPEN,
          message: `fiscal period "${period.id}" is ${period.status}, not open`,
          fiscalPeriod: period.id,
          status: period.status
        }));
      } else if (!isDateWithinPeriod(period, entry.date)) {
        errors.push(createValidationError({
          code: JOURNAL_ERROR_CODES.DATE_OUTSIDE_PERIOD,
          message: `entry date ${entry.date} falls outside fiscal period "${period.id}" (${period.startDate} to ${period.endDate})`,
          fiscalPeriod: period.id,
          date: entry.date
        }));
      }
    }
  }

  return createValidationResult(errors);
}

/**
 * Throwing form of validateJournalEntry, for a fail-fast caller (a future
 * posting engine that must never persist an unbalanced entry).
 * @param {import('../contracts/journalContract.js').JournalEntry} entry
 * @param {object} [options] same as validateJournalEntry
 * @returns {true}
 * @throws {TypeError} listing every failed rule
 */
export function assertBalancedJournalEntry (entry, options = {}) {
  const result = validateJournalEntry(entry, options);
  if (!result.isValid) {
    throw new TypeError(`assertBalancedJournalEntry: ${formatValidationErrors(result.errors)}`);
  }
  return true;
}
