// calculators/pricingCalculator.js (Milestone 12D)
// Pure calculation only. Price difference, margin %, and markup % -- the
// genuinely new numeric domain this milestone adds (no existing calculator
// anywhere in this platform compares an average/current SELLING price
// against an average/current PURCHASE price for the same item; 12C's own
// calculators/marginCalculator.js computes margin from a transaction's
// batch cost basis against its own revenue, a different, already-reused
// figure -- see metrics/pricingMetrics.js's own header comment).
//
// Both calculateMarginPct() and calculateMarkupPct() call
// calculatePercentage() (calculators/percentageCalculator.js) for their
// actual division -- per this milestone's mandatory architecture rule, no
// percentage anywhere in Pricing Intelligence re-derives `(x / y) * 100`
// on its own.

import { calculatePercentage } from './percentageCalculator.js';

/**
 * @param {number|null} sellingPrice
 * @param {number|null} cost
 * @returns {number|null} sellingPrice - cost, or null if either input is missing
 */
export function calculatePriceDifference (sellingPrice, cost) {
  if (sellingPrice === null || sellingPrice === undefined || cost === null || cost === undefined) return null;
  return sellingPrice - cost;
}

/**
 * Margin % expresses profit as a percentage of the SELLING price.
 * @param {number|null} sellingPrice
 * @param {number|null} cost
 * @returns {number|null}
 */
export function calculateMarginPct (sellingPrice, cost) {
  const difference = calculatePriceDifference(sellingPrice, cost);
  if (difference === null) return null;
  return calculatePercentage(difference, sellingPrice);
}

/**
 * Markup % expresses profit as a percentage of the COST price.
 * @param {number|null} sellingPrice
 * @param {number|null} cost
 * @returns {number|null}
 */
export function calculateMarkupPct (sellingPrice, cost) {
  const difference = calculatePriceDifference(sellingPrice, cost);
  if (difference === null) return null;
  return calculatePercentage(difference, cost);
}
