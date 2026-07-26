// audit/purchaseAuditReporter.js (Milestone 12B)
// Mirrors audit/biAuditReporter.js's own role and boundary from 12A
// (frozen, unmodified by this milestone; this is a new, sibling file, not
// an edit to that one). Business Intelligence remains read-only and does
// NOT audit every query -- this is the one, narrow bridge to the existing
// Audit Platform for the three things worth auditing: generated purchase
// reports, exports, and scheduled purchase-intelligence job runs. Reuses
// the Audit Platform exactly the way biAuditReporter.js does: publishing a
// real Domain Event (EVENT_TYPES.PURCHASE_INSIGHT_GENERATED, added to
// events/registry/eventTypes.js) and letting the already-existing
// auditSubscriber observe it like any other event. Never writes an audit
// record itself, never starts auditSubscriber.

import { eventBus, EVENT_TYPES } from '../../events/index.js';

/**
 * @param {object} args
 * @param {string} args.companyId
 * @param {'onDemand'|'export'|'scheduled'} args.reportType
 * @param {number} args.itemsAnalyzed
 * @param {number} args.suppliersCompared
 * @param {string} args.generatedAt ISO-8601
 */
export function recordPurchaseInsightGenerated ({ companyId, reportType, itemsAnalyzed, suppliersCompared, generatedAt }) {
  eventBus.publish(EVENT_TYPES.PURCHASE_INSIGHT_GENERATED, {
    aggregateId: companyId || 'unknown',
    payload: { reportType, itemsAnalyzed, suppliersCompared, generatedAt },
    context: { company: companyId, module: 'businessIntelligence' }
  });
}
