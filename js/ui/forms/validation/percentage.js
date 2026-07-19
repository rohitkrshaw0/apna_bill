// A validator for percentage-style fields — GST rate, discount, margin,
// commission, service charge, etc. — anything entered as a plain number
// that must fall within a range, 0-100 by default.
//
// Follows the same factory-returns-check shape as every validator in
// js/ui/forms/validation; see required.js for the full explanation.
//
// An empty value is treated as valid here — pair `percentage()` with
// `required()` on fields where a value must also be present. This mirrors
// how HTML's own `required` and `min`/`max` attributes are independent of
// each other today.

export function percentage ({ min = 0, max = 100, message } = {}) {
  return function check (value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (Number.isNaN(number)) return message || 'Must be a number';
    if (number < min || number > max) return message || `Must be between ${min} and ${max}`;
    return null;
  };
}
