// =====================================================================
// analysisReports/inventoryInvestment.js
// Milestone 14C.5's own Report Definition + registration for Inventory
// Investment Analysis.
//
// Business Intelligence Consumption Ledger (ADR-0006):
//   Public API consumed:   inventoryIntelligence.getCategoryPerformance()
//   Intelligence module:   Inventory Intelligence (12A),
//                           aggregators/categorySummaryAggregator.js
//   Zero calculation:      yes -- CategorySummary (Inventory variant) rows
//                           arrive pre-aggregated (totalInventoryValue,
//                           avgTurnoverRatio, ...)
//   Presentation-only:     yes -- search by category name, sort, no
//                           calculation of any kind
//
// Answers "where is inventory investment concentrated" at category grain --
// distinct from Current Stock (14B.4B, per-item valuation, already covers
// the per-item case) and from a company-wide total (a single number, not a
// report). Deliberately single-domain (Inventory only), same reasoning as
// Category Sales Performance (14C.2): joining this against Purchase/Sales/
// Pricing's own CategorySummary variants would be Business Intelligence
// composition, out of scope for Reporting (ADR-0006).
//
// Disclosed BI limitation carried unmodified from the underlying
// aggregator: "category" is an hsn_sac proxy, not a true taxonomy.
//
// category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE (ADR-0006 decision 1).
// No data provider file (ADR-0006 decision 2).
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const inventoryInvestmentReportDefinition = createReportDefinition({
  id: 'inventory-investment',
  title: 'Inventory Investment Analysis',
  description: 'Per-category stock quantity, inventory value, and turnover -- sourced from Business Intelligence, not recalculated here. Category is an hsn_sac proxy, not a full product taxonomy (a pre-existing, disclosed Business Intelligence limitation).',
  category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'inventory-investment.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerInventoryInvestmentReport () {
  if (!reportRegistry.has(inventoryInvestmentReportDefinition.id)) {
    reportRegistry.register(inventoryInvestmentReportDefinition);
  }
  return inventoryInvestmentReportDefinition;
}
