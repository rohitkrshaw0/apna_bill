// audit/salesAuditReporter.js (Milestone 12C)
// Mirrors audit/biAuditReporter.js (12A) and audit/purchaseAuditReporter.js
// (12B), both frozen. Business Intelligence remains read-only and does NOT
// audit every query -- this is the one, narrow bridge to the existing
// Audit Platform for generated sales reports, exports, and scheduled
// sales-intelligence job runs. Publishes EVENT_TYPES.SALES_INSIGHT_GENERATED
// (added to events/registry/eventTypes.js). Never writes an audit record
// itself, never starts auditSubscriber.

import { eventBus, EVENT_TYPES } from '../../events/index.js';

/**
 * @param {object} args
 * @param {string} args.companyId
 * @param {'onDemand'|'export'|'scheduled'} args.reportType
 * @param {number} args.itemsAnalyzed
 * @param {number} args.customersAnalyzed
 * @param {string} args.generatedAt ISO-8601
 */
export function recordSalesInsightGenerated ({ companyId, reportType, itemsAnalyzed, customersAnalyzed, generatedAt }) {
  eventBus.publish(EVENT_TYPES.SALES_INSIGHT_GENERATED, {
    aggregateId: companyId || 'unknown',
    payload: { reportType, itemsAnalyzed, customersAnalyzed, generatedAt },
    context: { company: companyId, module: 'businessIntelligence' }
  });
}
