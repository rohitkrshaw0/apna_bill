// calculators/marginCalculator.js (Milestone 12C)
// Pure calculation only. Gross margin -- the other genuinely new numeric
// domain this milestone adds. No existing calculator computes revenue
// minus cost anywhere in this platform (12A's own `avgCost` is a stock
// valuation figure, never compared against a selling price).
//
// Known, disclosed limitation: margin is computable only for lines with a
// resolved `batchCostPrice` (i.e. batch-tracked items whose batch was
// still resolvable at load time) -- the same "non-batch-tracked items have
// no per-line cost basis" limitation 12A's own COGS calculation already
// discloses for stock_ledger. A line with `batchCostPrice === null` is
// excluded from both the numerator and the revenue denominator, not
// silently treated as zero cost (which would overstate margin).

/**
 * @param {object[]} lines invoice_line rows (docType === 'sale' only should be
 *   passed in -- returns are excluded by the caller, the same way
 *   calculators/averagePriceCalculator.js is only ever called with 'sale' lines)
 * @returns {{marginableRevenue: number, grossMargin: number, grossMarginPct: number|null}}
 *   `marginableRevenue` is the lineTotal sum of only the lines margin could
 *   actually be computed for -- the correct denominator for `grossMarginPct`.
 */
export function calculateGrossMargin (lines) {
  const marginable = lines.filter((l) => l.batchCostPrice !== null && l.batchCostPrice !== undefined);
  const marginableRevenue = marginable.reduce((sum, l) => sum + (l.lineTotal || 0), 0);
  const grossMargin = marginable.reduce((sum, l) => sum + ((l.rate - l.batchCostPrice) * (l.qty || 0)), 0);
  return {
    marginableRevenue,
    grossMargin,
    grossMarginPct: marginableRevenue > 0 ? (grossMargin / marginableRevenue) * 100 : null
  };
}
