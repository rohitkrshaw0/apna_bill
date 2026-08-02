// =====================================================================
// operationalReports/supplierPurchaseProfile.js
// Milestone 14B.6's own Report Definition + registration for Supplier
// Purchase Profile -- deliberately NOT sourced the same way Customer
// Purchase Profile was. A repository architecture audit (performed
// before writing any code) found Supplier Intelligence (12E) is a
// dedicated, purpose-built domain composing FOUR sibling domains
// (Purchase + Pricing + Sales + Inventory Intelligence) specifically for
// per-supplier analysis -- something no "customerIntelligence" domain
// exists to mirror. Its own public API,
// supplierIntelligence.getSupplierMetricsSnapshot(), already returns a
// full per-supplier array (js/services/businessIntelligence/metrics/
// supplierPerformanceMetrics.js's own output) -- purchaseCount,
// purchaseValue, avgOrderValue, lastPurchaseDate, PLUS
// revenueContribution, marginContributionPct, inventoryContribution,
// costTrend, priceStability, discount stats -- richer than the narrower
// purchaseIntelligence.getPurchaseMetricsSnapshot()'s own raw
// supplierMetrics array would have been. This report calls the
// SupplierIntelligence public function directly and does no calculation
// of its own beyond presentation.
//
// Disclosed scope limit, carried from metrics/supplierMetrics.js's own
// header comment (the base data supplierPerformanceMetrics.js composes
// verbatim): this covers only suppliers purchased from within the
// snapshot's lookback window (default 365 days) -- "not a master
// supplier directory." A registered supplier with zero purchases in that
// window will not appear here.
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const supplierPurchaseProfileReportDefinition = createReportDefinition({
  id: 'supplier-purchase-profile',
  title: 'Supplier Purchase Profile',
  description: 'Per-supplier purchasing performance -- order count, total spend, average order value, purchase frequency, revenue/margin contribution, cost trend, and price stability -- sourced from Business Intelligence, not recalculated here. Covers suppliers with at least one purchase in the last 365 days, not a full supplier directory.',
  category: REPORT_CATEGORIES.SUPPLIER,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'supplier-purchase-profile.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerSupplierPurchaseProfileReport () {
  if (!reportRegistry.has(supplierPurchaseProfileReportDefinition.id)) {
    reportRegistry.register(supplierPurchaseProfileReportDefinition);
  }
  return supplierPurchaseProfileReportDefinition;
}
