// metrics/pricingMetrics.js (Milestone 12D)
// Reusable, per-item pricing metrics -- mirrors metrics/purchaseMetrics.js
// (12B) and metrics/salesMetrics.js (12C)'s own role: one metric object per
// item, computed once, reused by every aggregator/recommendation
// downstream. Unlike either of those, this is a JOIN, not a fresh scan --
// its entire value is combining sell-side (metrics/salesMetrics.js) and
// buy-side (metrics/purchaseMetrics.js) price figures those two milestones
// already compute, per item, into one row. Both are called here VERBATIM,
// unmodified -- their own avg/last/highest/lowest price, cost-trend, and
// (for sales) gross-margin fields are reused wholesale, never re-derived.
//
// Only three things are genuinely new calculation this milestone adds,
// each via its own calculator (never inline here):
//   - price difference / margin % / markup % (calculators/pricingCalculator.js),
//     comparing the sell-side price series against the buy-side one --
//     no existing calculator compares the two.
//   - average/maximum discount % and discount frequency
//     (calculators/discountCalculator.js), from each side's own line-level
//     discountPct/discountAmt (Milestone 12D's own additive addition to
//     purchase/purchaseDataLoader.js and sales/salesDataLoader.js).
//   - price volatility / stability (calculators/priceVolatilityCalculator.js),
//     over each side's own historical per-line rate series.
//
// `sellingPriceTrend`/`purchasePriceTrend` are plain aliases of
// metrics/salesMetrics.js's and metrics/purchaseMetrics.js's own `costTrend`
// field (COST_TREND, calculators/purchaseTrendCalculator.js) -- zero new
// trend classification logic, the same "deep reuse" precedent
// metrics/salesMetrics.js's own header comment documents for 12C.

import { computeSalesMetrics } from './salesMetrics.js';
import { computePurchaseMetrics } from './purchaseMetrics.js';
import { resolveCategory } from '../calculators/categoryCalculator.js';
import { calculatePriceDifference, calculateMarginPct, calculateMarkupPct } from '../calculators/pricingCalculator.js';
import { calculateAverageDiscountPct, calculateMaxDiscountPct, calculateDiscountFrequency } from '../calculators/discountCalculator.js';
import { calculatePriceVolatility, classifyPriceStability } from '../calculators/priceVolatilityCalculator.js';

/**
 * @param {import('../pricing/pricingDataLoader.js').PricingSnapshot} snapshot
 * @param {object} [opts] forwarded to computeSalesMetrics/computePurchaseMetrics (rollingAverageWindow, trendThresholdPct) and classifyPriceStability (stableMaxVolatilityPct, volatileMinVolatilityPct)
 * @returns {object[]} one metric object per item known to the items table, a sale, or a purchase within the window
 */
export function computePricingMetrics (snapshot, opts = {}) {
  const { itemsById, purchaseSnapshot, salesSnapshot } = snapshot;

  const salesMetrics = computeSalesMetrics(salesSnapshot, opts);
  const purchaseMetrics = computePurchaseMetrics(purchaseSnapshot, opts);
  const salesByItem = new Map(salesMetrics.map((m) => [m.itemId, m]));
  const purchaseByItem = new Map(purchaseMetrics.map((m) => [m.itemId, m]));

  const itemIds = new Set([...itemsById.keys(), ...salesByItem.keys(), ...purchaseByItem.keys()]);

  return [...itemIds].map((itemId) => {
    const item = itemsById.get(itemId) || null;
    const sale = salesByItem.get(itemId) || null;
    const purchase = purchaseByItem.get(itemId) || null;

    const saleLines = (salesSnapshot.invoiceLinesByItem.get(itemId) || []).filter((l) => l.docType === 'sale');
    const purchaseLines = purchaseSnapshot.purchaseLinesByItem.get(itemId) || [];

    const currentSellingPrice = item ? item.defaultRetailPrice : null;
    const currentPurchasePrice = item ? item.defaultPurchasePrice : null;
    const avgSellingPrice = sale ? sale.avgSellingPrice : null;
    const avgPurchasePrice = purchase ? purchase.avgPurchasePrice : null;

    const sellingPriceVolatilityPct = calculatePriceVolatility(saleLines.map((l) => l.rate));
    const purchasePriceVolatilityPct = calculatePriceVolatility(purchaseLines.map((l) => l.rate));

    return {
      itemId,
      name: (item && item.name) || (sale && sale.name) || (purchase && purchase.name) || null,
      category: resolveCategory({ hsnSac: (item && item.hsnSac) || (sale && sale.category) || (purchase && purchase.category) || null }),

      currentSellingPrice,
      currentPurchasePrice,
      avgSellingPrice,
      avgPurchasePrice,
      highestSellingPrice: sale ? sale.highestSellingPrice : null,
      lowestSellingPrice: sale ? sale.lowestSellingPrice : null,
      highestPurchasePrice: purchase ? purchase.highestPurchasePrice : null,
      lowestPurchasePrice: purchase ? purchase.lowestPurchasePrice : null,

      priceDifference: calculatePriceDifference(avgSellingPrice, avgPurchasePrice),
      marginPct: calculateMarginPct(avgSellingPrice, avgPurchasePrice),
      markupPct: calculateMarkupPct(avgSellingPrice, avgPurchasePrice),

      // Reused verbatim from metrics/salesMetrics.js's own
      // calculators/marginCalculator.js-derived figures -- a distinct,
      // transaction-level (batch cost basis vs actual line revenue) margin
      // figure, not re-derived here.
      grossMargin: sale ? sale.grossMargin : null,
      grossMarginPct: sale ? sale.grossMarginPct : null,

      avgDiscountPct: calculateAverageDiscountPct(saleLines),
      maxDiscountPct: calculateMaxDiscountPct(saleLines),
      discountFrequencyPct: calculateDiscountFrequency(saleLines),

      sellingPriceVolatilityPct,
      purchasePriceVolatilityPct,
      priceStability: classifyPriceStability(sellingPriceVolatilityPct, opts),

      sellingPriceTrend: sale ? sale.costTrend : null,
      sellingPriceTrendChangePct: sale ? sale.costTrendChangePct : null,
      purchasePriceTrend: purchase ? purchase.costTrend : null,
      purchasePriceTrendChangePct: purchase ? purchase.costTrendChangePct : null,

      salesFrequencyPerYear: sale ? sale.salesFrequencyPerYear : null
    };
  });
}
