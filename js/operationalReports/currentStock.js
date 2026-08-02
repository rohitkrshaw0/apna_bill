// =====================================================================
// operationalReports/currentStock.js
// Milestone 14B.4B's own Report Definition + registration for Current
// Stock -- the second Inventory Reports (14B.4) report, and deliberately
// NOT modeled on the Stock Register's own ERP-path shape.
//
// dataSource: BUSINESS_INTELLIGENCE (ADR-0004 path 1), not ERP. A schema
// validation performed before writing any code for this report found:
//   - batches.qty_on_hand is authoritative only for track_batches=true
//     items; a track_batches=false item has no batch row at all, and its
//     only current balance is a stock_ledger aggregate.
//   - js/services/businessIntelligence/metrics/itemMetrics.js's own
//     computeCurrentStock() already implements exactly that two-path
//     logic, correctly, for every item -- and it is exposed through this
//     platform's own public API, inventoryIntelligence.getItemMetricsSnapshot(),
//     not just through internal-only aggregators.
// Per ADR-0004's own test ("does Business Intelligence already compute
// this, even approximately? If yes, path 1"), this report calls that
// public function directly. No new js/*RegisterData.js-style ERP
// provider exists for this report, and none should -- see
// docs/reports/milestone-14B4B-completion.md for the full comparison
// against the three ERP-sourced reports (Sales/Purchase/Stock Register)
// that came before it.
//
// Milestone 14B.4C (Low Stock, Negative Stock): a report architecture
// review performed before writing any of that code found these are NOT
// materially different reports -- same BUSINESS_INTELLIGENCE call, same
// columns, same shell/toolbar/filters/print/export, differing only by a
// stock-status predicate over fields Current Stock already loads
// (currentStock, lowStockThreshold). BI's own
// calculators/movementCalculator.js confirms there is no separate
// "negative stock" concept at all -- only isOutOfStock (currentStock <= 0)
// and isLowStock. Per this platform's own "reuse over duplication"
// discipline, both are registered here as two additional, lightweight
// ReportDefinitions -- discoverable and distinct in the Reports hub -- but
// both `href` into the SAME current-stock.html screen with a
// `?status=` preset query param current-stock.html reads on load and
// pre-selects in its own Stock Status filter (still user-changeable --
// this is a starting view, not a locked-down separate page). No second or
// third HTML file, no duplicated shell/toolbar/data-fetch code.
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const currentStockReportDefinition = createReportDefinition({
  id: 'current-stock',
  title: 'Current Stock',
  description: 'Every item\'s current stock quantity, value, and stock status -- sourced from Business Intelligence, not recalculated here -- with filtering, search, sorting, print and CSV export.',
  category: REPORT_CATEGORIES.INVENTORY,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.CATEGORY,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'current-stock.html'
});

// Same category/dataSource/filters/exportFormats as Current Stock -- these
// are the same report, entered pre-filtered. Only id/title/description/href differ.
export const lowStockReportDefinition = createReportDefinition({
  id: 'low-stock',
  title: 'Low Stock',
  description: 'Items at or below their own low stock threshold -- a preset view of Current Stock, not a separate report -- with filtering, search, sorting, print and CSV export.',
  category: REPORT_CATEGORIES.INVENTORY,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.CATEGORY,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'current-stock.html?status=lowStock'
});

export const negativeStockReportDefinition = createReportDefinition({
  id: 'negative-stock',
  title: 'Negative Stock',
  description: 'Items with a negative current stock quantity -- a data anomaly that should not occur under normal operation -- a preset view of Current Stock, not a separate report.',
  category: REPORT_CATEGORIES.INVENTORY,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.CATEGORY,
    REPORT_FILTER_KEYS.STATUS,
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'current-stock.html?status=negativeStock'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerCurrentStockReport () {
  if (!reportRegistry.has(currentStockReportDefinition.id)) {
    reportRegistry.register(currentStockReportDefinition);
  }
  return currentStockReportDefinition;
}

/** Idempotent, same pattern -- see this file's own header comment for why this shares current-stock.html rather than getting its own screen. */
export function registerLowStockReport () {
  if (!reportRegistry.has(lowStockReportDefinition.id)) {
    reportRegistry.register(lowStockReportDefinition);
  }
  return lowStockReportDefinition;
}

/** Idempotent, same pattern -- see this file's own header comment for why this shares current-stock.html rather than getting its own screen. */
export function registerNegativeStockReport () {
  if (!reportRegistry.has(negativeStockReportDefinition.id)) {
    reportRegistry.register(negativeStockReportDefinition);
  }
  return negativeStockReportDefinition;
}
