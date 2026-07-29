// metrics/supplierPerformanceMetrics.js (Milestone 12E)
// Reusable, per-supplier PERFORMANCE metrics -- unlike every prior
// domain's own metrics/*.js (each computed from ONE snapshot this
// platform's own loader just scanned), this one is a JOIN across FOUR
// already-computed metric arrays from FOUR sibling domains
// (metrics/supplierMetrics.js + the raw PurchaseSnapshot, 12B;
// metrics/pricingMetrics.js, 12D; metrics/salesMetrics.js, 12C;
// metrics/itemMetrics.js, 12A) -- exactly the milestone's own
// "MOST IMPORTANT ARCHITECTURAL RULE": Supplier Performance = Purchase
// History + Pricing History + Sales Performance + Inventory Performance,
// composed, never recomputed.
//
// Every purchase-side base fact (purchaseCount, purchaseValue,
// avgOrderValue, lastPurchaseDate, daysSinceLastPurchase,
// purchaseFrequency/PerYear) is `metrics/supplierMetrics.js`'s (12B) own
// row, spread through UNMODIFIED. Cost trend
// (`calculators/purchaseTrendCalculator.js`, 12B), discount stats
// (`calculators/discountCalculator.js`, 12D), and price volatility/
// stability (`calculators/priceVolatilityCalculator.js`, 12D) are all
// reused VERBATIM against this supplier's own purchase_line rows (grouped
// here, once, by supplierId -- the one genuinely new grouping this
// milestone needs, since no prior domain ever grouped purchase lines by
// supplier). Revenue/margin/inventory CONTRIBUTION
// (`calculators/supplierContributionCalculator.js`) is the one genuinely
// new numeric domain -- summing already-computed per-item figures from
// three other domains across this supplier's own item set.

import { calculateCostTrend } from '../calculators/purchaseTrendCalculator.js';
import { calculateAverageDiscountPct, calculateMaxDiscountPct, calculateDiscountFrequency } from '../calculators/discountCalculator.js';
import { calculatePriceVolatility, classifyPriceStability } from '../calculators/priceVolatilityCalculator.js';
import { calculateRevenueContribution, calculateMarginContribution, calculateInventoryContribution } from '../calculators/supplierContributionCalculator.js';
import { groupMetricsByCategory, UNCATEGORIZED } from '../calculators/categoryCalculator.js';

function groupPurchaseLinesBySupplier (purchaseLines) {
  const map = new Map();
  for (const line of purchaseLines) {
    if (!line.supplierId) continue;
    if (!map.has(line.supplierId)) map.set(line.supplierId, []);
    map.get(line.supplierId).push(line);
  }
  return map;
}

function buildCategoryDistribution (itemIds, pricingMetricsByItemId) {
  const rows = itemIds.map((id) => ({ category: pricingMetricsByItemId.get(id)?.category || UNCATEGORIZED }));
  const grouped = groupMetricsByCategory(rows);
  return [...grouped.entries()]
    .map(([category, group]) => ({ category, itemCount: group.length }))
    .sort((a, b) => b.itemCount - a.itemCount);
}

/**
 * @param {object} args
 * @param {object[]} args.supplierMetrics metrics/supplierMetrics.js output (12B, reused verbatim)
 * @param {import('../purchase/purchaseDataLoader.js').PurchaseSnapshot} args.purchaseSnapshot the raw snapshot (for per-supplier line grouping only -- no new query)
 * @param {object[]} args.pricingMetrics metrics/pricingMetrics.js output (12D, reused verbatim)
 * @param {object[]} args.salesMetrics metrics/salesMetrics.js output (12C, reused verbatim)
 * @param {object[]} args.itemMetrics metrics/itemMetrics.js output (12A, reused verbatim)
 * @param {object} [opts] forwarded to calculateCostTrend/classifyPriceStability (trendThresholdPct, stableMaxVolatilityPct, volatileMinVolatilityPct)
 * @returns {object[]} one composed metric object per supplier purchased from within the window
 */
export function computeSupplierPerformanceMetrics ({ supplierMetrics, purchaseSnapshot, pricingMetrics, salesMetrics, itemMetrics }, opts = {}) {
  const asOfDate = new Date(purchaseSnapshot.generatedAt);
  const { lookbackDays } = purchaseSnapshot;

  const purchaseLinesBySupplier = groupPurchaseLinesBySupplier(purchaseSnapshot.purchaseLines);
  const pricingMetricsByItemId = new Map(pricingMetrics.map((m) => [m.itemId, m]));
  const salesMetricsByItemId = new Map(salesMetrics.map((m) => [m.itemId, m]));
  const itemMetricsByItemId = new Map(itemMetrics.map((m) => [m.itemId, m]));

  return supplierMetrics.map((supplier) => {
    const lines = purchaseLinesBySupplier.get(supplier.supplierId) || [];
    const itemIds = [...new Set(lines.map((l) => l.itemId))];

    const costTrend = calculateCostTrend(lines, { asOfDate, lookbackDays, ...opts });
    const priceVolatilityPct = calculatePriceVolatility(lines.map((l) => l.rate));

    return {
      // Reused verbatim from metrics/supplierMetrics.js (12B) -- no
      // purchase-volume/value/frequency figure is recomputed here.
      ...supplier,

      productCount: itemIds.length,
      activeProductCount: itemIds.filter((id) => itemMetricsByItemId.get(id)?.isActive).length,
      categoryDistribution: buildCategoryDistribution(itemIds, pricingMetricsByItemId),

      revenueContribution: calculateRevenueContribution(itemIds, salesMetricsByItemId),
      marginContributionPct: calculateMarginContribution(itemIds, pricingMetricsByItemId, salesMetricsByItemId),
      inventoryContribution: calculateInventoryContribution(itemIds, itemMetricsByItemId),

      avgDiscountPct: calculateAverageDiscountPct(lines),
      maxDiscountPct: calculateMaxDiscountPct(lines),
      discountFrequencyPct: calculateDiscountFrequency(lines),

      costTrend: costTrend.trend,
      costTrendChangePct: costTrend.changePct,

      priceVolatilityPct,
      priceStability: classifyPriceStability(priceVolatilityPct, opts)
    };
  });
}
