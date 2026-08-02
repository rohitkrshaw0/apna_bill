// =====================================================================
// analysisReports/marginAnalysis.js
// Milestone 14C.4's own Report Definition + registration for Margin
// Analysis -- the first consumer of `pricingIntelligence` anywhere in
// this application (12 public methods, zero call sites before this).
//
// Business Intelligence Consumption Ledger (ADR-0006):
//   Public API consumed:   pricingIntelligence.getPricingMetricsSnapshot()
//                           -> .pricingMetrics
//   Intelligence module:   Pricing Intelligence (12D), metrics/pricingMetrics.js
//   Zero calculation:      yes -- PricingMetric rows arrive fully computed
//                           (marginPct, markupPct, avgDiscountPct,
//                           priceStability, ...)
//   Presentation-only:     yes -- search by name, filter by category and by
//                           price stability band (a presentation bucket over
//                           the already-computed priceStability field, not a
//                           new classification), sort, paginate, print, CSV
//
// One report answers both "Margin Analysis" and "Product Profitability"
// (roadmap examples) -- PricingMetric already carries marginPct, markupPct,
// and avgDiscountPct in a single row, so there is no distinct second report
// to build: sort-by covers every lens the same way Customer/Supplier
// Purchase Profile (14B) already fold ranking + frequency + recency into
// one screen via a sort control rather than three screens.
//
// Deliberately does NOT bucket by margin threshold (above/below target) --
// that comparison is what pricingIntelligence.getMarginAnalysis()'s own
// `targetMarginPct` parameter performs; re-implementing it here against a
// hardcoded threshold would be a duplicated calculation, not a presentation
// bucket of an already-computed field. Sorting by `marginPct` and reading
// the actual number achieves the same practical result without it.
//
// category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE (ADR-0006 decision 1).
// No data provider file (ADR-0006 decision 2).
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const marginAnalysisReportDefinition = createReportDefinition({
  id: 'margin-analysis',
  title: 'Margin Analysis',
  description: 'Per-item margin %, markup %, discount behavior, and price stability -- sourced from Business Intelligence, not recalculated here. Answers where margins are strongest and weakest.',
  category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.CATEGORY,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'margin-analysis.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerMarginAnalysisReport () {
  if (!reportRegistry.has(marginAnalysisReportDefinition.id)) {
    reportRegistry.register(marginAnalysisReportDefinition);
  }
  return marginAnalysisReportDefinition;
}
