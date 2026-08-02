// =====================================================================
// analysisReports/productMovementAnalysis.js
// Milestone 14C.5's own Report Definition + registration for Product
// Movement Analysis, plus three Registry Presets (Fast Moving, Slow
// Moving, Dead Stock).
//
// Business Intelligence Consumption Ledger (ADR-0006):
//   Public API consumed:   inventoryIntelligence.getInventorySummary()
//   Intelligence module:   Inventory Intelligence (12A),
//                           calculators/movementCalculator.js, surfaced via
//                           aggregators/{fastMoving,slowMoving,deadStock,
//                           overstock}Aggregator.js
//   Zero calculation:      yes -- items arrive already classified into the
//                           model's own fastMoving/slowMoving/deadStock/
//                           overstock lists; this report only labels which
//                           list an item came from
//   Presentation-only:     yes -- search, filter by category and movement
//                           class, sort, paginate, print, CSV
//
// SPECIAL VALIDATION (required before writing this report -- see
// docs/architecture/ADR/0006-business-analysis-report-pattern.md and the
// 14C milestone plan's own §2): is this the same capability as Stock
// Register (14B.4A), the way "Stock Movement Register" was found to be in
// 14B.4D? NO. Zero column overlap beyond item name:
//   - Stock Register: ERP-sourced, one row per stock_ledger MOVEMENT
//     TRANSACTION (date, item, batch, txn type, qty in/out, notes).
//   - Product Movement Analysis: BUSINESS_INTELLIGENCE-sourced, one row
//     per ITEM, classified by turnover behavior (turnover ratio, days of
//     cover, qty sold in window, days since last sale).
// Stock Movement Register was killed in 14B.4D because it was the same
// query, same table, same columns as Stock Register. This report shares
// none of those properties -- named "Product Movement Analysis", not
// "Inventory Movement", specifically so no future contributor confuses it
// with the report 14B.4D eliminated.
//
// Disclosed scope limit: covers only items Business Intelligence has
// classified into one of its four movement lists. A normally-moving item
// appears in none of them and is not listed here -- it remains visible in
// Current Stock (14B.4B), which covers every item.
//
// category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE (ADR-0006 decision 1).
// No data provider file (ADR-0006 decision 2).
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const productMovementAnalysisReportDefinition = createReportDefinition({
  id: 'product-movement-analysis',
  title: 'Product Movement Analysis',
  description: 'Every item Business Intelligence has classified as fast moving, slow moving, dead stock, or overstocked -- by turnover behavior, not by listing stock_ledger transactions (that is Stock Register). Sourced from Business Intelligence, not recalculated here.',
  category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.CATEGORY,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'product-movement-analysis.html'
});

// Same category/dataSource/filters/exportFormats as the base report --
// these are the same report, entered pre-filtered to one movement class.
// Mirrors js/operationalReports/currentStock.js's own Low Stock/Negative
// Stock preset mechanism exactly (?status= there, ?movement= here).
export const fastMovingReportDefinition = createReportDefinition({
  id: 'fast-moving-items',
  title: 'Fast Moving Items',
  description: 'Items with turnover at or above the fast-moving threshold -- a preset view of Product Movement Analysis, not a separate report.',
  category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.CATEGORY,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'product-movement-analysis.html?movement=fastMoving'
});

export const slowMovingReportDefinition = createReportDefinition({
  id: 'slow-moving-items',
  title: 'Slow Moving Items',
  description: 'Items with turnover below the slow-moving threshold -- a preset view of Product Movement Analysis, not a separate report.',
  category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.CATEGORY,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'product-movement-analysis.html?movement=slowMoving'
});

export const deadStockAnalysisReportDefinition = createReportDefinition({
  id: 'dead-stock-analysis',
  title: 'Dead Stock Analysis',
  description: 'Items with no recorded sale within the dead-stock window -- a preset view of Product Movement Analysis, not a separate report.',
  category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.CATEGORY,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'product-movement-analysis.html?movement=deadStock'
});

/** Idempotent -- safe to call from every page that needs this report registered. */
export function registerProductMovementAnalysisReport () {
  if (!reportRegistry.has(productMovementAnalysisReportDefinition.id)) {
    reportRegistry.register(productMovementAnalysisReportDefinition);
  }
  return productMovementAnalysisReportDefinition;
}

/** Idempotent, same pattern -- see this file's own header comment for why this shares product-movement-analysis.html rather than getting its own screen. */
export function registerFastMovingReport () {
  if (!reportRegistry.has(fastMovingReportDefinition.id)) {
    reportRegistry.register(fastMovingReportDefinition);
  }
  return fastMovingReportDefinition;
}

/** Idempotent, same pattern. */
export function registerSlowMovingReport () {
  if (!reportRegistry.has(slowMovingReportDefinition.id)) {
    reportRegistry.register(slowMovingReportDefinition);
  }
  return slowMovingReportDefinition;
}

/** Idempotent, same pattern. */
export function registerDeadStockAnalysisReport () {
  if (!reportRegistry.has(deadStockAnalysisReportDefinition.id)) {
    reportRegistry.register(deadStockAnalysisReportDefinition);
  }
  return deadStockAnalysisReportDefinition;
}
