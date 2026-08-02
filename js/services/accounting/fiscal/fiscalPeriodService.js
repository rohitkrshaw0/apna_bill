// fiscal/fiscalPeriodService.js
// Registration and state management for a company's fiscal periods
// (Milestone 15A "Fiscal Period Platform"). Called a SERVICE rather than a
// registry, deliberately: it holds the same six registry methods every
// other registry in this platform does, but it also owns state
// transitions (close/reopen/lock) a pure registry does not. Those
// transitions never mutate -- close(id) reads the current period,
// produces a new frozen period via fiscalPeriodContract.js's toClosed(),
// and rebinds the Map slot. No FiscalPeriod object is ever mutated; only
// the Map's reference to it changes. This is the jobLifecycle idiom
// applied to a store, stated explicitly so "you froze the objects but the
// container is mutable" is answered before it is asked.
//
// ---------------------------------------------------------------------
// THIS IS NOT A MODULE-LEVEL SINGLETON -- THE SHARPEST DEVIATION FROM
// THE REPORTING TEMPLATE IN THIS PLATFORM
// ---------------------------------------------------------------------
// fyStartMonth comes from companies.fy_start_month, which is PER-COMPANY
// (schema.sql) and is 1 in at least one existing test fixture, not always
// 4. A shared module-level instance would bake one company's setting into
// every caller and silently mislabel another company's fiscal years. So
// unlike accountRegistry/voucherTypeRegistry/postingProviderRegistry --
// which index.js constructs once as shared singletons -- a
// fiscalPeriodService is constructed HERE, by whoever loads a specific
// company's chart of accounts, with that company's own fyStartMonth.

import { createFiscalPeriod, assertValidFiscalPeriod, toClosed, toReopened, toLocked, canPostToPeriod } from './fiscalPeriodContract.js';
import { resolveFiscalYearLabel, DEFAULT_FY_START_MONTH } from './fiscalYear.js';

/**
 * @param {object} [options]
 * @param {number} [options.fyStartMonth] 1-12, this company's companies.fy_start_month
 * @returns {object} { register, get, list, has, unregister, clear, findPeriodForDate,
 *   resolveFiscalYearForDate, close, reopen, lock, canPostOn }
 */
export function createFiscalPeriodService ({ fyStartMonth = DEFAULT_FY_START_MONTH } = {}) {
  /** @type {Map<string, import('./fiscalPeriodContract.js').FiscalPeriod>} */
  const periods = new Map();

  function overlaps (a, b) {
    return a.fiscalYear === b.fiscalYear && a.startDate <= b.endDate && b.startDate <= a.endDate;
  }

  /**
   * @param {import('./fiscalPeriodContract.js').FiscalPeriod} period
   * @throws {TypeError} if the id is already registered, or the period overlaps an
   *   already-registered period in the same fiscal year -- two overlapping open
   *   periods would make findPeriodForDate non-deterministic
   */
  function register (period) {
    assertValidFiscalPeriod(period);
    if (periods.has(period.id)) {
      throw new TypeError(`fiscalPeriodService.register: "${period.id}" is already registered`);
    }
    for (const existing of periods.values()) {
      if (overlaps(existing, period)) {
        throw new TypeError(`fiscalPeriodService.register: "${period.id}" overlaps registered period "${existing.id}"`);
      }
    }
    periods.set(period.id, period);
    return period;
  }

  function get (id) {
    return periods.get(id) || null;
  }

  /** @returns {import('./fiscalPeriodContract.js').FiscalPeriod[]} sorted by startDate */
  function list () {
    return [...periods.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  function has (id) {
    return periods.has(id);
  }

  function unregister (id) {
    return periods.delete(id);
  }

  function clear () {
    periods.clear();
  }

  /**
   * @param {string} date 'YYYY-MM-DD'
   * @returns {import('./fiscalPeriodContract.js').FiscalPeriod|null}
   */
  function findPeriodForDate (date) {
    for (const period of periods.values()) {
      if (date >= period.startDate && date <= period.endDate) return period;
    }
    return null;
  }

  /**
   * @param {string} date 'YYYY-MM-DD'
   * @returns {string} this company's fiscal year label for the date, e.g. '2025-26'
   */
  function resolveFiscalYearForDate (date) {
    return resolveFiscalYearLabel(date, fyStartMonth);
  }

  function transition (id, transitionFn, actionLabel) {
    const existing = periods.get(id);
    if (!existing) {
      throw new TypeError(`fiscalPeriodService.${actionLabel}: "${id}" is not registered`);
    }
    const next = transitionFn(existing);
    periods.set(id, next);
    return next;
  }

  const close = (id) => transition(id, toClosed, 'close');
  const reopen = (id) => transition(id, toReopened, 'reopen');
  const lock = (id) => transition(id, toLocked, 'lock');

  /**
   * @param {string} date 'YYYY-MM-DD'
   * @returns {boolean} false when no period is registered for the date -- fails closed
   */
  function canPostOn (date) {
    const period = findPeriodForDate(date);
    return period ? canPostToPeriod(period) : false;
  }

  return { register, get, list, has, unregister, clear, findPeriodForDate, resolveFiscalYearForDate, close, reopen, lock, canPostOn };
}

// Re-exported so a caller that only imports the service can also build a
// period to register with it, without a second import from the contract
// module.
export { createFiscalPeriod };
