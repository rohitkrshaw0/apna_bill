// audit/pricingAuditReporter.js (Milestone 12D)
// Mirrors audit/biAuditReporter.js (12A), audit/purchaseAuditReporter.js
// (12B), and audit/salesAuditReporter.js (12C), all frozen. Business
// Intelligence remains read-only and does NOT audit every query -- this is
// the one, narrow bridge to the existing Audit Platform for generated
// pricing reports, exports, and scheduled pricing-intelligence job runs.
// Publishes EVENT_TYPES.PRICING_INSIGHT_GENERATED (added to
// events/registry/eventTypes.js). Never writes an audit record itself,
// never starts auditSubscriber.

import { eventBus, EVENT_TYPES } from '../../events/index.js';

/**
 * @param {object} args
 * @param {string} args.companyId
 * @param {'onDemand'|'export'|'scheduled'} args.reportType
 * @param {number} args.itemsAnalyzed
 * @param {string} args.generatedAt ISO-8601
 */
export function recordPricingInsightGenerated ({ companyId, reportType, itemsAnalyzed, generatedAt }) {
  eventBus.publish(EVENT_TYPES.PRICING_INSIGHT_GENERATED, {
    aggregateId: companyId || 'unknown',
    payload: { reportType, itemsAnalyzed, generatedAt },
    context: { company: companyId, module: 'businessIntelligence' }
  });
}
