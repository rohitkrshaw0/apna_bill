// calculators/discountCalculator.js (Milestone 12D)
// Pure calculation only. Average discount %, maximum discount %, and
// discount frequency -- derived from purchase_line/invoice_line rows'
// own `discountPct`/`discountAmt` columns (schema.sql: both tables carry
// `discount_pct numeric(6,3) not null default 0` and
// `discount_amt numeric(14,2) not null default 0` -- never null, so no
// null-guard is needed the way batchCostPrice's does in
// calculators/marginCalculator.js).
//
// A line's own `discountPct` is trusted first (the rate actually applied
// at billing time); `discountAmt` is used only as a fallback derivation
// when `discountPct` reads 0 but `discountAmt` does not (a manual flat
// discount entered without a %) -- and that fallback derivation, like
// every other percentage in this domain, is computed via
// calculatePercentage() (calculators/percentageCalculator.js), never a
// second, independent `(x / y) * 100`.

import { calculatePercentage } from './percentageCalculator.js';

/**
 * @param {{discountPct?: number, discountAmt?: number, taxableValue?: number}} line
 * @returns {number} the effective discount %, 0 if neither field indicates a discount
 */
function effectiveDiscountPct (line) {
  if (line.discountPct) return line.discountPct;
  if (line.discountAmt) {
    const grossValue = (line.taxableValue || 0) + line.discountAmt;
    return calculatePercentage(line.discountAmt, grossValue) || 0;
  }
  return 0;
}

/**
 * @param {object[]} lines purchase_line or invoice_line rows, each with {discountPct, discountAmt, taxableValue}
 * @returns {number|null} the simple mean of every line's effective discount %, or null if no lines
 */
export function calculateAverageDiscountPct (lines) {
  if (!lines.length) return null;
  const total = lines.reduce((sum, l) => sum + effectiveDiscountPct(l), 0);
  return total / lines.length;
}

/**
 * @param {object[]} lines purchase_line or invoice_line rows
 * @returns {number|null} the highest effective discount % observed, or null if no lines
 */
export function calculateMaxDiscountPct (lines) {
  if (!lines.length) return null;
  return lines.reduce((max, l) => Math.max(max, effectiveDiscountPct(l)), 0);
}

/**
 * @param {object[]} lines purchase_line or invoice_line rows
 * @returns {number|null} % of lines carrying any discount at all, or null if no lines
 */
export function calculateDiscountFrequency (lines) {
  if (!lines.length) return null;
  const discountedCount = lines.filter((l) => effectiveDiscountPct(l) > 0).length;
  return calculatePercentage(discountedCount, lines.length);
}
