// calculators/supplierSpendCalculator.js
// Pure calculation only (Milestone 12B). Total spend, purchase count, and
// average order value for one supplier's own purchase (bill) rows --
// distinct from per-item price calculators (averagePriceCalculator.js),
// this operates on whole purchases (grandTotal per bill), not individual
// purchase_line rows.

/**
 * @param {object[]} purchases this supplier's own purchase rows, each with {grandTotal}
 * @returns {{totalValue: number, totalCount: number, avgOrderValue: number|null}}
 */
export function calculateSupplierSpend (purchases) {
  const totalCount = purchases.length;
  const totalValue = purchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);
  return {
    totalValue,
    totalCount,
    avgOrderValue: totalCount > 0 ? totalValue / totalCount : null
  };
}
