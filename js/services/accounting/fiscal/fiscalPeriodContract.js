// fiscal/fiscalPeriodContract.js
// The immutable shape and pure state transitions of a fiscal period
// (Milestone 15A "Fiscal Period Platform"). No schema, no persistence --
// an in-memory record a future posting engine checks before it writes.
//
// ---------------------------------------------------------------------
// WHY THREE STATES, NOT TWO
// ---------------------------------------------------------------------
// OPEN     -- postable.
// CLOSED   -- not postable, but REOPENABLE. The ordinary month-end or
//             year-end close, which an accountant routinely reverses to
//             post one late entry.
// LOCKED   -- not postable, and TERMINAL. Post-audit or post-statutory-
//             filing; reopening a locked period is not a business
//             operation this platform models. toReopened() on a LOCKED
//             period throws, because a UI should never offer that button
//             -- calling it is a programmer error, not user input, the
//             same distinction ADR-0011 draws for validation generally.
//
// Two states would make CLOSED and LOCKED indistinguishable and one of
// them dead weight; naming both is the whole point of a fiscal period
// having a status at all.
//
// ---------------------------------------------------------------------
// TRANSITIONS FOLLOW THE REPORTING/JOB LIFECYCLE IDIOM EXACTLY
// ---------------------------------------------------------------------
// Every toX() is pure: deepFreeze({ ...period, status: X }), never a
// mutation. Same shape as reporting/lifecycle/reportLifecycle.js's
// toLoading/toLoaded/toError.

import { deepFreeze } from '../shared/freezeDeep.js';
import { isIsoDateString } from '../shared/isoDate.js';

export const FISCAL_PERIOD_STATUS = Object.freeze({
  OPEN: 'open',
  CLOSED: 'closed',
  LOCKED: 'locked'
});

/**
 * @typedef {object} FiscalPeriod
 * @property {string} id unique, no ad hoc duplicates (enforced at the owning service's register())
 * @property {string} fiscalYear e.g. '2025-26' (see fiscalYear.js)
 * @property {string} label human-readable, e.g. 'April 2025' or 'Q1 2025-26'
 * @property {string} startDate 'YYYY-MM-DD', inclusive
 * @property {string} endDate 'YYYY-MM-DD', inclusive
 * @property {string} status one of FISCAL_PERIOD_STATUS
 * @property {object} metadata
 */

/**
 * @param {object} fields
 * @returns {FiscalPeriod}
 */
export function createFiscalPeriod ({ id, fiscalYear, label, startDate, endDate, status = FISCAL_PERIOD_STATUS.OPEN, metadata = {} }) {
  assertValidFiscalPeriodFields({ id, fiscalYear, label, startDate, endDate, status, metadata });
  return deepFreeze({ id, fiscalYear, label, startDate, endDate, status, metadata: { ...metadata } });
}

function assertValidFiscalPeriodFields ({ id, fiscalYear, label, startDate, endDate, status, metadata }) {
  if (!id || typeof id !== 'string') throw new TypeError('createFiscalPeriod: id is required');
  if (!fiscalYear || typeof fiscalYear !== 'string') throw new TypeError('createFiscalPeriod: fiscalYear is required');
  if (!label || typeof label !== 'string') throw new TypeError('createFiscalPeriod: label is required');
  if (!isIsoDateString(startDate)) throw new TypeError(`createFiscalPeriod: startDate must be a real calendar date in YYYY-MM-DD form, received ${JSON.stringify(startDate)}`);
  if (!isIsoDateString(endDate)) throw new TypeError(`createFiscalPeriod: endDate must be a real calendar date in YYYY-MM-DD form, received ${JSON.stringify(endDate)}`);
  if (startDate > endDate) throw new TypeError(`createFiscalPeriod: startDate ${startDate} is after endDate ${endDate}`);
  if (!Object.values(FISCAL_PERIOD_STATUS).includes(status)) {
    throw new TypeError(`createFiscalPeriod: status must be one of ${Object.values(FISCAL_PERIOD_STATUS).join(', ')}, received "${status}"`);
  }
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('createFiscalPeriod: metadata must be a plain object');
  }
}

const REQUIRED_FIELDS = ['id', 'fiscalYear', 'label', 'startDate', 'endDate', 'status', 'metadata'];

/** @param {FiscalPeriod} period */
export function assertValidFiscalPeriod (period) {
  if (!period || typeof period !== 'object') throw new TypeError('assertValidFiscalPeriod: period must be an object');
  for (const key of REQUIRED_FIELDS) {
    if (!(key in period)) throw new TypeError(`assertValidFiscalPeriod: missing "${key}"`);
  }
  return true;
}

/** @param {FiscalPeriod} period @returns {FiscalPeriod} a new, closed period; pure */
export function toClosed (period) {
  return deepFreeze({ ...period, status: FISCAL_PERIOD_STATUS.CLOSED });
}

/**
 * @param {FiscalPeriod} period
 * @returns {FiscalPeriod} a new, open period; pure
 * @throws {TypeError} if the period is LOCKED -- reopening a locked period is not
 *   a business operation this platform models; a UI should never offer this button
 */
export function toReopened (period) {
  if (period.status === FISCAL_PERIOD_STATUS.LOCKED) {
    throw new TypeError(`toReopened: fiscal period "${period.id}" is locked and cannot be reopened`);
  }
  return deepFreeze({ ...period, status: FISCAL_PERIOD_STATUS.OPEN });
}

/** @param {FiscalPeriod} period @returns {FiscalPeriod} a new, locked period; pure; terminal */
export function toLocked (period) {
  return deepFreeze({ ...period, status: FISCAL_PERIOD_STATUS.LOCKED });
}

/** @param {FiscalPeriod} period @returns {boolean} */
export function canPostToPeriod (period) {
  return period?.status === FISCAL_PERIOD_STATUS.OPEN;
}

/**
 * @param {FiscalPeriod} period
 * @param {string} date 'YYYY-MM-DD' -- lexicographic compare is correct for this format
 * @returns {boolean}
 */
export function isDateWithinPeriod (period, date) {
  return isIsoDateString(date) && date >= period.startDate && date <= period.endDate;
}
