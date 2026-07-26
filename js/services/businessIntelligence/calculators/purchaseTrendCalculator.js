// calculators/purchaseTrendCalculator.js
// Pure calculation only (Milestone 12B). Rolling purchase average and cost
// trend classification (rising/falling/stable), both derived from one
// item's purchase_line rows (each carrying its own billDate, attached by
// purchase/purchaseDataLoader.js). Reuses calculateAvgPurchasePrice()
// rather than re-deriving the qty-weighted average formula a second time.

import { calculateAvgPurchasePrice } from './averagePriceCalculator.js';
import { PURCHASE_DEFAULTS } from '../shared/config.js';

/**
 * @param {object[]} lines purchase_line rows for one item, each with {qty, rate, billDate}
 * @param {{rollingAverageWindow?: number}} [opts]
 * @returns {number|null} qty-weighted average price of the `rollingAverageWindow` most recent purchases, or null if no lines
 */
export function calculateRollingPurchaseAverage (lines, { rollingAverageWindow = PURCHASE_DEFAULTS.rollingAverageWindow } = {}) {
  if (!lines.length) return null;
  const sorted = [...lines].sort((a, b) => (b.billDate || '').localeCompare(a.billDate || ''));
  return calculateAvgPurchasePrice(sorted.slice(0, rollingAverageWindow));
}

export const COST_TREND = Object.freeze({
  RISING: 'rising',
  FALLING: 'falling',
  STABLE: 'stable',
  INSUFFICIENT_DATA: 'insufficientData'
});

/**
 * Splits this item's purchase history into a "recent half" and an "older
 * half" of the lookback window (by billDate), compares their qty-weighted
 * average prices, and classifies the direction. Never estimates a trend
 * from fewer than one purchase per half -- an item with all its purchases
 * clustered in one half reports INSUFFICIENT_DATA rather than a fabricated
 * direction.
 * @param {object[]} lines purchase_line rows for one item, each with {qty, rate, billDate}
 * @param {{asOfDate: Date, lookbackDays: number, trendThresholdPct?: number}} args
 * @returns {{trend: string, changePct: number|null, recentAvgPrice: number|null, olderAvgPrice: number|null}}
 */
export function calculateCostTrend (lines, { asOfDate, lookbackDays, trendThresholdPct = PURCHASE_DEFAULTS.trendThresholdPct }) {
  const midpoint = new Date(asOfDate);
  midpoint.setUTCDate(midpoint.getUTCDate() - Math.floor(lookbackDays / 2));
  const midpointIso = midpoint.toISOString().slice(0, 10);

  const recentLines = lines.filter((l) => l.billDate && l.billDate >= midpointIso);
  const olderLines = lines.filter((l) => l.billDate && l.billDate < midpointIso);

  const recentAvgPrice = calculateAvgPurchasePrice(recentLines);
  const olderAvgPrice = calculateAvgPurchasePrice(olderLines);

  if (recentAvgPrice === null || olderAvgPrice === null || olderAvgPrice === 0) {
    return { trend: COST_TREND.INSUFFICIENT_DATA, changePct: null, recentAvgPrice, olderAvgPrice };
  }

  const changePct = ((recentAvgPrice - olderAvgPrice) / olderAvgPrice) * 100;
  let trend = COST_TREND.STABLE;
  if (changePct >= trendThresholdPct) trend = COST_TREND.RISING;
  else if (changePct <= -trendThresholdPct) trend = COST_TREND.FALLING;

  return { trend, changePct, recentAvgPrice, olderAvgPrice };
}
