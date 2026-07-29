// calculators/supplierContributionCalculator.js (Milestone 12E)
// Pure calculation only. The one genuinely new numeric domain this
// milestone adds: summing/averaging ALREADY-COMPUTED per-item metrics
// (from Sales Intelligence, Pricing Intelligence, Inventory Intelligence --
// 12C/12D/12A, all reused verbatim) across the set of items one supplier
// has supplied. This is the composition math the milestone's own
// "MOST IMPORTANT ARCHITECTURAL RULE" describes ("Supplier Performance =
// Purchase History + Pricing History + Sales Performance + Inventory
// Performance") -- no revenue, margin, or inventory-value figure is
// re-derived from raw ERP rows here; every number fed in already exists on
// a `SalesMetric`/`PricingMetric`/`ItemMetric` row.

/**
 * @param {string[]} itemIds items this supplier has supplied
 * @param {Map<string, object>} salesMetricsByItemId itemId -> SalesMetric (metrics/salesMetrics.js, 12C)
 * @returns {number} sum of netSales across itemIds -- 0 (not null) when nothing sold, since "no revenue" is a real, valid zero, not a missing measurement
 */
export function calculateRevenueContribution (itemIds, salesMetricsByItemId) {
  return itemIds.reduce((sum, id) => sum + (salesMetricsByItemId.get(id)?.netSales || 0), 0);
}

/**
 * @param {string[]} itemIds items this supplier has supplied
 * @param {Map<string, object>} itemMetricsByItemId itemId -> ItemMetric (metrics/itemMetrics.js, 12A)
 * @returns {number} sum of inventoryValue across itemIds
 */
export function calculateInventoryContribution (itemIds, itemMetricsByItemId) {
  return itemIds.reduce((sum, id) => sum + (itemMetricsByItemId.get(id)?.inventoryValue || 0), 0);
}

/**
 * Revenue-weighted average margin % across this supplier's own items --
 * weighted (not a simple mean) because a supplier's margin CONTRIBUTION
 * should reflect items that actually sell, not be skewed by a rarely-sold
 * item's own margin %. Items with no resolvable marginPct or no netSales
 * are excluded from both the weighted sum and the weight total, the same
 * "excluded, not treated as zero" discipline calculators/marginCalculator.js
 * (12C) established for a line with no resolvable batch cost.
 * @param {string[]} itemIds items this supplier has supplied
 * @param {Map<string, object>} pricingMetricsByItemId itemId -> PricingMetric (metrics/pricingMetrics.js, 12D)
 * @param {Map<string, object>} salesMetricsByItemId itemId -> SalesMetric (metrics/salesMetrics.js, 12C)
 * @returns {number|null} revenue-weighted average margin %, or null if no item qualifies
 */
export function calculateMarginContribution (itemIds, pricingMetricsByItemId, salesMetricsByItemId) {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const id of itemIds) {
    const pricing = pricingMetricsByItemId.get(id);
    const sales = salesMetricsByItemId.get(id);
    if (!pricing || pricing.marginPct === null || !sales || !sales.netSales) continue;
    weightedSum += pricing.marginPct * sales.netSales;
    weightTotal += sales.netSales;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : null;
}
