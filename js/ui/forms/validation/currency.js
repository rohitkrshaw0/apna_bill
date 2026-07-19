// A validator for currency-style fields — prices, amount received, etc. —
// a plain number that must not be negative by default.
//
// Follows the same factory-returns-check shape as every validator in
// js/ui/forms/validation; see required.js for the full explanation.
//
// An empty value is treated as valid here — pair `currency()` with
// `required()` on fields where a value must also be present.

export function currency ({ min = 0, message } = {}) {
  return function check (value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (Number.isNaN(number)) return message || 'Must be a valid amount';
    if (number < min) return message || `Must be at least ${min}`;
    return null;
  };
}
