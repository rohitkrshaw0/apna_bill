// audit/biAuditReporter.js
// Business Intelligence is READ ONLY and does NOT audit every query (per
// the milestone brief). This file is the one, narrow bridge to the
// existing Audit Platform (11E) for the three things the brief says ARE
// worth auditing: generated reports, dashboard exports, and scheduled BI
// job runs. It reuses the Audit Platform the same way every other
// consumer does -- by publishing a real Domain Event
// (EVENT_TYPES.INVENTORY_INSIGHT_GENERATED, added in
// events/registry/eventTypes.js) and letting the already-existing,
// already-started-or-not `auditSubscriber` observe it like any other
// event. This file never imports from audit/ directly, never writes an
// audit record itself, and never starts the audit subscriber -- exactly
// the same boundary every ERP business file (purchases.js, sales.js,
// items.js) already respects with the Event Bus.

import { eventBus, EVENT_TYPES } from '../../events/index.js';

/**
 * @param {object} args
 * @param {string} args.companyId
 * @param {'onDemand'|'export'|'scheduled'} args.reportType
 * @param {number} args.itemsAnalyzed
 * @param {string} args.generatedAt ISO-8601
 */
export function recordInventoryInsightGenerated ({ companyId, reportType, itemsAnalyzed, generatedAt }) {
  eventBus.publish(EVENT_TYPES.INVENTORY_INSIGHT_GENERATED, {
    aggregateId: companyId || 'unknown',
    payload: { reportType, itemsAnalyzed, generatedAt },
    context: { company: companyId, module: 'businessIntelligence' }
  });
}
