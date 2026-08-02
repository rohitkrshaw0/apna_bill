// shared/isoDate.js
// 'YYYY-MM-DD' validation, shared by contracts/journalContract.js (a
// journal entry's posting date) and fiscal/fiscalPeriodContract.js (a
// period's start/end bounds). Two real consumers is this repository's own
// threshold for extracting a shared primitive rather than duplicating.
//
// The format regex is the same one dataExchange/xml/validators/
// xmlBusinessRules.js already uses, so an imported date and a posted date
// are judged by one rule. The calendar round-trip on top of it is this
// module's own addition: the regex alone accepts '2025-02-31', which is a
// real date string in no calendar and must never reach a ledger.
//
// Deliberately NOT a date-math library. No parsing to Date objects for
// comparison, no timezone handling: 'YYYY-MM-DD' strings compare correctly
// with < and > lexicographically, which is what every consumer here needs
// and is why the app already stores dates this way.
//
// Internal primitive -- deliberately NOT re-exported from index.js.

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {*} value
 * @returns {boolean} true only for a well-formed AND real calendar date
 */
export function isIsoDateString (value) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  // Round-trip through a real Date and compare the components back: this is
  // what rejects '2025-02-31' (which rolls forward to March 3) and
  // '2025-13-01'. Date's month argument is 0-based.
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year
    && probe.getMonth() === month - 1
    && probe.getDate() === day;
}
