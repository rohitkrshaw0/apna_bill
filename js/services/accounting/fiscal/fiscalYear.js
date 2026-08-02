// fiscal/fiscalYear.js
// Fiscal year label derivation (Milestone 15A "Fiscal Period Platform").
//
// This is bug-compatible with Postgres ON PURPOSE. schema.sql already
// defines the fiscal-year label as data every invoice/purchase row
// carries:
//
//   create or replace function current_fy(_dt date, _fy_start_month int)
//   returns text language plpgsql immutable as $$
//   declare y int; m int; start_y int;
//   begin
//     y := extract(year from _dt)::int;
//     m := extract(month from _dt)::int;
//     if m >= _fy_start_month then start_y := y; else start_y := y - 1; end if;
//     return start_y::text || '-' || lpad(((start_y + 1) % 100)::text, 2, '0');
//   end;
//   $$;
//
// resolveFiscalYearLabel() below reproduces this CHARACTER FOR CHARACTER,
// including its edge behaviour: (start_y + 1) % 100 with lpad(_, 2, '0')
// yields '2099-00' for a fiscal year starting in 2099. That is a latent
// defect in the SQL, but a JS implementation that disagrees with the
// database on any date is a live data-integrity bug -- the same invoice
// would carry two different fy_label values depending on which side
// computed it. This is a deliberate fidelity choice, not an oversight.
// Fixing the century-rollover defect requires changing both sides
// together, in a separate, data-migration-aware milestone -- not here.
//
// companies.fy_start_month defaults to 4 (April, the Indian fiscal year),
// but it is PER-COMPANY and is 1 in at least one existing test fixture
// (dataExchange/apnabill/apnabillRestore.test.html). Every function here
// takes fyStartMonth as a parameter with that default; nothing in this
// module assumes April.

import { isIsoDateString } from '../shared/isoDate.js';

export const DEFAULT_FY_START_MONTH = 4;

function assertValidFyStartMonth (fyStartMonth) {
  if (!Number.isInteger(fyStartMonth) || fyStartMonth < 1 || fyStartMonth > 12) {
    throw new TypeError(`fiscalYear: fyStartMonth must be an integer 1-12, received ${JSON.stringify(fyStartMonth)}`);
  }
}

function assertValidDate (date, fnName) {
  if (!isIsoDateString(date)) {
    throw new TypeError(`${fnName}: date must be a real calendar date in YYYY-MM-DD form, received ${JSON.stringify(date)}`);
  }
}

/**
 * @param {string} date 'YYYY-MM-DD'
 * @param {number} [fyStartMonth] 1-12, per-company (companies.fy_start_month)
 * @returns {string} e.g. '2025-26' -- identical to Postgres current_fy()
 */
export function resolveFiscalYearLabel (date, fyStartMonth = DEFAULT_FY_START_MONTH) {
  assertValidDate(date, 'resolveFiscalYearLabel');
  assertValidFyStartMonth(fyStartMonth);

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const startYear = month >= fyStartMonth ? year : year - 1;

  // Faithful reproduction of Postgres's (start_y + 1) % 100 + lpad(_, 2, '0'),
  // including its century-rollover defect -- see the header.
  const endYearSuffix = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYearSuffix}`;
}

/**
 * @param {string} label e.g. '2025-26'
 * @returns {number} the fiscal year's start calendar year, e.g. 2025
 */
export function resolveFiscalYearStartYear (label) {
  if (typeof label !== 'string' || !/^\d{4}-\d{2}$/.test(label)) {
    throw new TypeError(`resolveFiscalYearStartYear: expected a 'YYYY-YY' label, received ${JSON.stringify(label)}`);
  }
  return Number(label.slice(0, 4));
}

/**
 * @param {string} label e.g. '2025-26'
 * @param {number} [fyStartMonth] 1-12
 * @returns {{startDate: string, endDate: string}} 'YYYY-MM-DD' bounds, inclusive
 */
export function resolveFiscalYearBounds (label, fyStartMonth = DEFAULT_FY_START_MONTH) {
  assertValidFyStartMonth(fyStartMonth);
  const startYear = resolveFiscalYearStartYear(label);

  const pad2 = (n) => String(n).padStart(2, '0');
  const startDate = `${startYear}-${pad2(fyStartMonth)}-01`;

  const endYear = fyStartMonth === 1 ? startYear : startYear + 1;
  const endMonth = fyStartMonth === 1 ? 12 : fyStartMonth - 1;
  const daysInEndMonth = new Date(endYear, endMonth, 0).getDate(); // day 0 of next month = last day of endMonth
  const endDate = `${endYear}-${pad2(endMonth)}-${pad2(daysInEndMonth)}`;

  return { startDate, endDate };
}
