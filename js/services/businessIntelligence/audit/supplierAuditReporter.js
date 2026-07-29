// audit/supplierAuditReporter.js (Milestone 12E)
// Mirrors audit/biAuditReporter.js (12A), audit/purchaseAuditReporter.js
// (12B), audit/salesAuditReporter.js (12C), and audit/pricingAuditReporter.js
// (12D), all frozen. Business Intelligence remains read-only and does NOT
// audit every query -- this is the one, narrow bridge to the existing
// Audit Platform for generated supplier reports, exports, and scheduled
// supplier-intelligence job runs. Publishes
// EVENT_TYPES.SUPPLIER_INSIGHT_GENERATED (added to
// events/registry/eventTypes.js). Never writes an audit record itself,
// never starts auditSubscriber.

import { eventBus, EVENT_TYPES } from '../../events/index.js';

/**
 * @param {object} args
 * @param {string} args.companyId
 * @param {'onDemand'|'export'|'scheduled'} args.reportType
 * @param {number} args.suppliersAnalyzed
 * @param {string} args.generatedAt ISO-8601
 */
export function recordSupplierInsightGenerated ({ companyId, reportType, suppliersAnalyzed, generatedAt }) {
  eventBus.publish(EVENT_TYPES.SUPPLIER_INSIGHT_GENERATED, {
    aggregateId: companyId || 'unknown',
    payload: { reportType, suppliersAnalyzed, generatedAt },
    context: { company: companyId, module: 'businessIntelligence' }
  });
}
