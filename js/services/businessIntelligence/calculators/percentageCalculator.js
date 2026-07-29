// calculators/percentageCalculator.js (Milestone 12D)
// The single shared ratio formula every Pricing Intelligence percentage
// (margin %, markup %, discount %, price volatility %, discount frequency)
// is required to be built on -- per this milestone's own architectural
// rule: "Every percentage calculation must come from a single shared
// calculator. Do not allow separate margin or markup formulas in different
// aggregators." calculators/pricingCalculator.js, discountCalculator.js,
// and priceVolatilityCalculator.js all import calculatePercentage() from
// here rather than re-deriving `(x / y) * 100` themselves -- one formula,
// one null-when-undefined-denominator guard, reused everywhere a
// percentage is computed in this domain.

/**
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number|null} (numerator / denominator) * 100, or null when denominator is 0/negative (avoids a division-by-zero or a misleading negative-base percentage)
 */
export function calculatePercentage (numerator, denominator) {
  if (denominator === null || denominator === undefined || denominator <= 0) return null;
  if (numerator === null || numerator === undefined) return null;
  return (numerator / denominator) * 100;
}
