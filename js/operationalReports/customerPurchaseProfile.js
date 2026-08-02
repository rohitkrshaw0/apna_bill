// =====================================================================
// operationalReports/customerPurchaseProfile.js
// Milestone 14B.5's own Report Definition + registration for Customer
// Purchase Profile (renamed from the original brief's "Customer Purchase
// History" -- an analytical customer profile, not a transaction listing,
// so it needed a name that says so; see docs/reports/milestone-14B5-completion.md).
//
// dataSource: BUSINESS_INTELLIGENCE (ADR-0004 path 1), same reasoning as
// Current Stock (14B.4B): Sales Intelligence's own public API,
// salesIntelligence.getSalesMetricsSnapshot(), already returns a
// customerMetrics array -- one object per customer with orderCount,
// totalSalesValue, avgOrderValue, lastSaleDate, daysSinceLastSale,
// avgDaysBetweenPurchases, salesFrequency, salesFrequencyPerYear,
// categories -- computed by js/services/businessIntelligence/metrics/
// customerMetrics.js. This report calls the public function directly and
// does no calculation of its own beyond presentation.
//
// Disclosed scope limit, carried from customerMetrics.js's own header
// comment: this covers only customers who bought something within the
// snapshot's lookback window (default 365 days) -- "not a master
// customer directory." A registered customer with zero purchases in that
// window will not appear here. This report's own screen surfaces that
// limitation in its empty/description copy rather than hiding it.
// =====================================================================

import {
  reportRegistry, createReportDefinition,
  REPORT_CATEGORIES, REPORT_DATA_SOURCES, REPORT_FILTER_KEYS, REPORT_EXPORT_FORMATS
} from '../services/reporting/index.js';

export const customerPurchaseProfileReportDefinition = createReportDefinition({
  id: 'customer-purchase-profile',
  title: 'Customer Purchase Profile',
  description: 'Per-customer purchasing profile -- order count, total spend, average order value, purchase frequency, and last purchase date -- sourced from Business Intelligence, not recalculated here. Covers customers with at least one sale in the last 365 days, not a full customer directory.',
  category: REPORT_CATEGORIES.CUSTOMER,
  dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE,
  filters: [
    REPORT_FILTER_KEYS.SEARCH
  ],
  exportFormats: [REPORT_EXPORT_FORMATS.CSV, REPORT_EXPORT_FORMATS.PRINT],
  href: 'customer-purchase-profile.html'
});

/**
 * Idempotent -- safe to call from every page that needs this report
 * registered against the shared, page-local reportRegistry instance.
 */
export function registerCustomerPurchaseProfileReport () {
  if (!reportRegistry.has(customerPurchaseProfileReportDefinition.id)) {
    reportRegistry.register(customerPurchaseProfileReportDefinition);
  }
  return customerPurchaseProfileReportDefinition;
}
