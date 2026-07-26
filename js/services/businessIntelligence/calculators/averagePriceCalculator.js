// calculators/averagePriceCalculator.js
// Pure calculation only (Milestone 12B). Average/last/highest/lowest
// purchase price -- all derived from the purchase_lines rows
// purchase/purchaseDataLoader.js already loaded for one item (never
// re-queried per calculation). Mirrors the "pure, no I/O, no formatting"
// rule calculators/inventoryValueCalculator.js already established in 12A.

/**
 * @param {object[]} lines purchase_line rows for one item, each with {qty, rate}
 * @returns {number|null} qty-weighted average rate, or null if no lines
 */
export function calculateAvgPurchasePrice (lines) {
  const totalQty = lines.reduce((sum, l) => sum + (l.qty || 0), 0);
  if (totalQty <= 0) return null;
  const totalValue = lines.reduce((sum, l) => sum + (l.qty || 0) * (l.rate || 0), 0);
  return totalValue / totalQty;
}

/**
 * @param {object[]} lines purchase_line rows, each with {rate, billDate}
 * @returns {number|null} the rate of the most recent (by billDate) row, or null if no lines
 */
export function calculateLastPurchasePrice (lines) {
  if (!lines.length) return null;
  let latest = lines[0];
  for (const l of lines) {
    if (!latest.billDate || (l.billDate && l.billDate > latest.billDate)) latest = l;
  }
  return latest.rate;
}

/**
 * @param {object[]} lines purchase_line rows, each with {rate}
 * @returns {number|null}
 */
export function calculateHighestPurchasePrice (lines) {
  if (!lines.length) return null;
  return lines.reduce((max, l) => Math.max(max, l.rate || 0), lines[0].rate || 0);
}

/**
 * @param {object[]} lines purchase_line rows, each with {rate}
 * @returns {number|null}
 */
export function calculateLowestPurchasePrice (lines) {
  if (!lines.length) return null;
  return lines.reduce((min, l) => Math.min(min, l.rate || 0), lines[0].rate || 0);
}
