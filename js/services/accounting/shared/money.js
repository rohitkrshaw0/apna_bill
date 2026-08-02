// shared/money.js
// The Accounting Platform's money representation (Milestone 15A "Balanced
// Entry Validation"). Every amount this platform records or compares passes
// through here.
//
// ---------------------------------------------------------------------
// WHY THIS FILE EXISTS
// ---------------------------------------------------------------------
// Money in this application is 2-decimal: every monetary column in
// schema.sql is numeric(14,2), and js/gst.js rounds every computed amount
// to 2 decimals with its own R(n, d = 2). But IEEE-754 doubles cannot
// represent most 2-decimal values exactly, so `sumDebits === sumCredits`
// is NOT a sound balance test -- 0.1 + 0.2 is 0.30000000000000004.
//
// The obvious workaround, an epsilon tolerance, is worse: a double-entry
// validator that tolerates imbalance is not a double-entry validator. This
// repository already contains that failure mode --
// dataExchange/xml/validators/xmlBusinessRules.js checks
// `Math.abs(sum) > 0.5` and emits a WARNING. A half-rupee tolerance on a
// double-entry check is exactly what this platform exists to not repeat.
//
// Decision (ADR-0008): integer minor units (paise) are the canonical
// representation for all summation and comparison. A rupee amount is
// converted ONCE, at contract construction, and the balance check is an
// exact integer `===` with no epsilon anywhere in the balance path.
//
// ---------------------------------------------------------------------
// WHY SUB-PAISE INPUT IS REJECTED RATHER THAN ROUNDED
// ---------------------------------------------------------------------
// Rounding belongs to whoever COMPUTES an amount -- a future posting
// provider, using gst.js's own math. Recording is this platform's job.
// Silently turning 100.005 into 100.01 hides the caller's bug and produces
// an entry whose debits and credits were each rounded independently, which
// is how a "balanced" entry that is off by a paisa gets written.
//
// ---------------------------------------------------------------------
// WHY THE TOLERANCE CONSTANT IS NOT A BUSINESS TOLERANCE
// ---------------------------------------------------------------------
// "Is this value exactly 2dp?" is itself unreliable in floating point:
// 1.15 * 100 === 114.99999999999999, so Number.isInteger(n * 100) would
// reject a perfectly legal rupee value. Meanwhile 0.1 + 0.2 scales to
// 30.000000000000004, which IS 30 paise and must be accepted.
//
// So the test separates float REPRESENTATION NOISE from genuine sub-paise
// PRECISION, in the scaled domain:
//
//     scaled = amount * 100
//     minor  = Math.round(scaled)
//     reject if Math.abs(scaled - minor) > MINOR_UNIT_TOLERANCE
//
// MINOR_UNIT_TOLERANCE is 1e-6 in the scaled domain, i.e. 1e-8 rupees. A
// genuine 2-decimal value lands within roughly 1e-10 of an integer after
// scaling (double relative error at these magnitudes). The smallest
// genuine sub-paise value, 0.001, scales to 0.1 -- five orders of
// magnitude outside the window. The two cases are cleanly separated, and
// the constant is derived from float representation, NOT chosen as an
// allowance for accounting error. It is not a tolerance on imbalance;
// the balance check itself has no tolerance at all.
//
// ---------------------------------------------------------------------
// RELATIONSHIP TO js/gst.js
// ---------------------------------------------------------------------
// roundMoney() converges on gst.js's R() rounding math deliberately, so an
// amount computed and rounded by gst.js never fails toMinorUnits() here.
// It DIVERGES from R() on one point, also deliberately: R(null) and R(NaN)
// return 0. In tax math that is a forgiving default; in a ledger it is
// data loss. A null debit is a bug to surface, not a zero to record, so
// every function here throws on a non-finite input.
//
// This platform does not import gst.js -- see index.js's own
// non-dependency claim. The convergence is on behaviour, not code.

import { deepFreeze } from './freezeDeep.js';

/** Decimal places in the major unit. Matches every numeric(14,2) column in schema.sql. */
export const MONEY_SCALE = 2;

/** Paise per rupee. */
export const MINOR_UNITS_PER_MAJOR = 100;

// Float-representation noise window in the SCALED domain -- see the header.
// Not exported: it is a derived implementation constant, not part of the
// platform's public surface, and nothing outside this module should be
// making its own precision judgements.
const MINOR_UNIT_TOLERANCE = 1e-6;

// numeric(14,2)'s ceiling: 14 total digits, 2 after the point.
const MAX_MONEY_MAJOR = 999999999999.99;

/**
 * Round to the platform's money scale. Same math as js/gst.js's R(), but
 * throws instead of returning 0 for a non-finite input (see header).
 * @param {number} amount
 * @param {number} [decimals]
 * @returns {number}
 */
export function roundMoney (amount, decimals = MONEY_SCALE) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new TypeError(`roundMoney: expected a finite number, received ${describeValue(amount)}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
    throw new TypeError(`roundMoney: decimals must be an integer 0-6, received ${describeValue(decimals)}`);
  }
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor) / factor;
}

/**
 * Convert a rupee amount to canonical integer paise. This is the only
 * conversion in the platform; every sum and comparison happens on the
 * result.
 * @param {number} amount a finite, non-negative, paise-representable rupee amount
 * @returns {number} integer paise
 * @throws {TypeError} on a non-finite, negative, out-of-range, or sub-paise amount
 */
export function toMinorUnits (amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new TypeError(`toMinorUnits: expected a finite number, received ${describeValue(amount)}`);
  }
  if (amount < 0) {
    throw new TypeError(`toMinorUnits: expected a non-negative amount, received ${amount}`);
  }
  if (amount > MAX_MONEY_MAJOR) {
    throw new TypeError(`toMinorUnits: ${amount} exceeds the maximum representable amount ${MAX_MONEY_MAJOR}`);
  }

  const scaled = amount * MINOR_UNITS_PER_MAJOR;
  const minor = Math.round(scaled);
  if (Math.abs(scaled - minor) > MINOR_UNIT_TOLERANCE) {
    throw new TypeError(
      `toMinorUnits: ${amount} has sub-paise precision -- round it to ${MONEY_SCALE} decimals before recording it`
    );
  }
  return minor;
}

/**
 * @param {number} minor integer paise
 * @returns {number} the rupee amount
 */
export function fromMinorUnits (minor) {
  if (!Number.isInteger(minor)) {
    throw new TypeError(`fromMinorUnits: expected an integer, received ${describeValue(minor)}`);
  }
  return minor / MINOR_UNITS_PER_MAJOR;
}

/**
 * Non-throwing predicate -- the same rules toMinorUnits() enforces.
 * For a caller that wants to test an amount without handling an exception.
 * @param {*} value
 * @returns {boolean}
 */
export function isMoneyAmount (value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value < 0 || value > MAX_MONEY_MAJOR) return false;
  const scaled = value * MINOR_UNITS_PER_MAJOR;
  return Math.abs(scaled - Math.round(scaled)) <= MINOR_UNIT_TOLERANCE;
}

/**
 * Integer sum with an explicit overflow guard.
 *
 * Not exported from index.js: callers reach this through
 * computeEntryTotals(), which is the shape a consumer actually wants.
 * The guard matters even though it is far from reachable with real data --
 * one line's maximum is 99,999,999,999,999 paise against
 * Number.MAX_SAFE_INTEGER's ~9.007e15, so roughly 90 maximum-value lines
 * would be needed. Silent precision loss in a balance check is the one
 * failure this module exists to prevent, so it is checked rather than
 * assumed.
 *
 * @param {number[]} minorValues
 * @returns {number}
 */
export function sumMinorUnits (minorValues) {
  if (!Array.isArray(minorValues)) {
    throw new TypeError(`sumMinorUnits: expected an array, received ${describeValue(minorValues)}`);
  }
  let total = 0;
  for (const value of minorValues) {
    if (!Number.isInteger(value)) {
      throw new TypeError(`sumMinorUnits: every value must be an integer, received ${describeValue(value)}`);
    }
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError('sumMinorUnits: running total exceeded Number.MAX_SAFE_INTEGER');
    }
  }
  return total;
}

/**
 * Fixed-2 rendering for ERROR MESSAGES only -- never for presentation. It
 * applies no locale, no grouping, and no currency symbol; a future UI
 * formats money its own way.
 * @param {number} minor integer paise
 * @returns {string}
 */
export function formatMinorUnits (minor) {
  return fromMinorUnits(minor).toFixed(MONEY_SCALE);
}

/** Compact, safe rendering of an arbitrary bad input for a message. */
function describeValue (value) {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return typeof value;
}

/** The scale facts a consumer may legitimately need. */
export const MONEY_LIMITS = deepFreeze({
  scale: MONEY_SCALE,
  minorUnitsPerMajor: MINOR_UNITS_PER_MAJOR,
  maxAmount: MAX_MONEY_MAJOR
});
