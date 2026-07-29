// calculators/priceVolatilityCalculator.js (Milestone 12D)
// Pure calculation only. Price volatility (the coefficient of variation --
// standard deviation as a % of the mean -- across an item's own historical
// per-line prices) and a stable/moderate/volatile classification derived
// from it. No existing calculator in this platform measures price
// DISPERSION -- calculators/purchaseTrendCalculator.js's costTrend
// classifies DIRECTION (recent half vs older half), a different question
// this milestone deliberately does not duplicate.
//
// The coefficient of variation is itself a percentage (stdDev / mean), so
// it is computed via calculatePercentage() (calculators/percentageCalculator.js)
// like every other percentage in this domain, never a second, independent
// `(x / y) * 100`.

import { calculatePercentage } from './percentageCalculator.js';
import { PRICING_DEFAULTS } from '../shared/config.js';

/**
 * @param {number[]} prices historical per-line prices for one item (purchase rate or selling rate)
 * @returns {number|null} the coefficient of variation as a %, or null with fewer than 2 valid prices or a zero mean
 */
export function calculatePriceVolatility (prices) {
  const valid = (prices || []).filter((p) => p !== null && p !== undefined);
  if (valid.length < 2) return null;

  const mean = valid.reduce((sum, p) => sum + p, 0) / valid.length;
  const variance = valid.reduce((sum, p) => sum + (p - mean) ** 2, 0) / valid.length;
  const stdDev = Math.sqrt(variance);

  return calculatePercentage(stdDev, mean);
}

export const PRICE_STABILITY = Object.freeze({
  STABLE: 'stable',
  MODERATE: 'moderate',
  VOLATILE: 'volatile',
  INSUFFICIENT_DATA: 'insufficientData'
});

/**
 * @param {number|null} volatilityPct calculatePriceVolatility()'s own output
 * @param {{stableMaxVolatilityPct?: number, volatileMinVolatilityPct?: number}} [opts]
 * @returns {string} one of PRICE_STABILITY's values
 */
export function classifyPriceStability (volatilityPct, {
  stableMaxVolatilityPct = PRICING_DEFAULTS.stableMaxVolatilityPct,
  volatileMinVolatilityPct = PRICING_DEFAULTS.volatileMinVolatilityPct
} = {}) {
  if (volatilityPct === null || volatilityPct === undefined) return PRICE_STABILITY.INSUFFICIENT_DATA;
  if (volatilityPct <= stableMaxVolatilityPct) return PRICE_STABILITY.STABLE;
  if (volatilityPct >= volatileMinVolatilityPct) return PRICE_STABILITY.VOLATILE;
  return PRICE_STABILITY.MODERATE;
}
