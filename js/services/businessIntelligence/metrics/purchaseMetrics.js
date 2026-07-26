// metrics/purchaseMetrics.js
// Reusable, per-item purchase metrics (Milestone 12B, mirroring
// metrics/itemMetrics.js's own role from 12A -- frozen, unmodified by this
// milestone). Pure function: takes the PurchaseSnapshot
// purchase/purchaseDataLoader.js already loaded and returns one metric
// object per item. Every purchase calculator is invoked exactly once per
// item here -- the same "one scan powers multiple insights" seam 12A
// established: every purchase aggregator downstream consumes this same
// array instead of re-deriving any of these numbers itself.

import { calculateAvgPurchasePrice, calculateLastPurchasePrice, calculateHighestPurchasePrice, calculateLowestPurchasePrice } from '../calculators/averagePriceCalculator.js';
import { calculateRollingPurchaseAverage, calculateCostTrend } from '../calculators/purchaseTrendCalculator.js';
import { calculatePurchaseFrequency, annualizePurchaseFrequency, calculateAvgDaysBetweenPurchases } from '../calculators/purchaseFrequencyCalculator.js';
import { resolveCategory } from '../calculators/categoryCalculator.js';
import { MS_PER_DAY } from '../shared/config.js';

function daysSince (isoDate, asOfDate) {
  if (!isoDate) return null;
  const diff = asOfDate.getTime() - new Date(isoDate).getTime();
  return diff >= 0 ? Math.floor(diff / MS_PER_DAY) : 0;
}

function latestBillDate (lines) {
  let latest = null;
  for (const l of lines) {
    if (l.billDate && (!latest || l.billDate > latest)) latest = l.billDate;
  }
  return latest;
}

/**
 * @param {import('../purchase/purchaseDataLoader.js').PurchaseSnapshot} snapshot
 * @param {object} [opts] forwarded to calculateRollingPurchaseAverage/calculateCostTrend (rollingAverageWindow, trendThresholdPct)
 * @returns {object[]} one metric object per item purchased within the snapshot's window
 */
export function computePurchaseMetrics (snapshot, opts = {}) {
  const asOfDate = new Date(snapshot.generatedAt);
  const { lookbackDays } = snapshot;

  const itemIds = [...snapshot.purchaseLinesByItem.keys()];

  return itemIds.map((itemId) => {
    const lines = snapshot.purchaseLinesByItem.get(itemId) || [];
    const firstLine = lines[0];

    const purchaseQty = lines.reduce((sum, l) => sum + (l.qty || 0), 0);
    const purchaseValue = lines.reduce((sum, l) => sum + (l.lineTotal || 0), 0);
    const lastPurchaseDate = latestBillDate(lines);

    const purchaseFrequency = calculatePurchaseFrequency(lines.length, lookbackDays);
    const billDatesAscending = [...new Set(lines.map((l) => l.billDate).filter(Boolean))].sort();
    const costTrend = calculateCostTrend(lines, { asOfDate, lookbackDays, ...opts });

    return {
      itemId,
      name: firstLine ? firstLine.itemName : null,
      category: resolveCategory({ hsnSac: firstLine ? firstLine.hsnSac : null }),

      purchaseCount: lines.length,
      purchaseQty,
      purchaseValue,

      avgPurchasePrice: calculateAvgPurchasePrice(lines),
      lastPurchasePrice: calculateLastPurchasePrice(lines),
      highestPurchasePrice: calculateHighestPurchasePrice(lines),
      lowestPurchasePrice: calculateLowestPurchasePrice(lines),

      lastPurchaseDate,
      daysSinceLastPurchase: daysSince(lastPurchaseDate, asOfDate),

      purchaseFrequency,
      purchaseFrequencyPerYear: annualizePurchaseFrequency(purchaseFrequency),
      avgDaysBetweenPurchases: calculateAvgDaysBetweenPurchases(billDatesAscending),
      rollingPurchaseAverage: calculateRollingPurchaseAverage(lines, opts),

      costTrend: costTrend.trend,
      costTrendChangePct: costTrend.changePct,
      recentAvgPrice: costTrend.recentAvgPrice,
      olderAvgPrice: costTrend.olderAvgPrice
    };
  });
}
