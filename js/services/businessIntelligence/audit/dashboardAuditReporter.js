// audit/dashboardAuditReporter.js (Milestone 12F)
// Mirrors audit/biAuditReporter.js (12A), audit/purchaseAuditReporter.js
// (12B), audit/salesAuditReporter.js (12C), audit/pricingAuditReporter.js
// (12D), and audit/supplierAuditReporter.js (12E), all frozen. The
// Dashboard remains read-only and does NOT audit every read -- per this
// milestone's own "AUDIT" section ("Audit only: Dashboard exports,
// Dashboard reports, Scheduled dashboard generation. Never audit normal
// dashboard reads."), this is the one, narrow bridge to the existing Audit
// Platform for a generated dashboard report/export. Publishes
// EVENT_TYPES.DASHBOARD_GENERATED (added to events/registry/eventTypes.js).
// Never writes an audit record itself, never starts auditSubscriber.

import { eventBus, EVENT_TYPES } from '../../events/index.js';

/**
 * @param {object} args
 * @param {string} args.companyId
 * @param {'onDemand'|'export'|'scheduled'} args.reportType
 * @param {string} args.generatedAt ISO-8601
 */
export function recordDashboardGenerated ({ companyId, reportType, generatedAt }) {
  eventBus.publish(EVENT_TYPES.DASHBOARD_GENERATED, {
    aggregateId: companyId || 'unknown',
    payload: { reportType, generatedAt },
    context: { company: companyId, module: 'businessIntelligence' }
  });
}
