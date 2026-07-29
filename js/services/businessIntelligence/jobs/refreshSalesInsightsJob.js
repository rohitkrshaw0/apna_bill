// jobs/refreshSalesInsightsJob.js (Milestone 12C)
// Mirrors jobs/refreshInventoryInsightsJob.js (12A) and
// jobs/refreshPurchaseInsightsJob.js (12B), both frozen. Reuses the
// existing Background Job Engine to keep the Sales Intelligence cache
// warm -- no new scheduler, one job registered via
// jobs/bootstrap/startBackgroundInfrastructure.js's own documented
// extension point.
//
// Triggered by SaleCreated (a new sale can change every sales metric) and
// CustomerCreated (a brand-new customer has no sales history yet, but
// warming the cache keeps customer-scoped views consistent from the first
// sale onward). Invalidates the affected company's cached sales metrics,
// recomputes and re-caches via generateSalesInsightReport({reportType:
// 'scheduled'}) (which also records the audit entry).
//
// Same subfolder-import precedent as its two siblings: imports
// jobs/registry/jobIds.js and jobs/contracts/jobContract.js directly,
// never jobs/index.js (circular-import avoidance -- see either sibling's
// own header comment).

import { EVENT_TYPES } from '../../events/index.js';
import { JOB_IDS } from '../../jobs/registry/jobIds.js';
import { createJobDefinition, createJobOutput } from '../../jobs/contracts/jobContract.js';
import { insightCache } from '../cache/insightCache.js';
import { salesIntelligence } from '../api/salesIntelligenceApi.js';

/** @param {import('../../jobs/contracts/jobContract.js').JobInput} input */
async function handler ({ event }) {
  const companyId = event.metadata?.company;
  if (!companyId) {
    return createJobOutput({ success: true, result: null, message: 'Event carried no company context -- nothing to refresh.' });
  }

  insightCache.invalidateCompany(companyId);
  const report = await salesIntelligence.generateSalesInsightReport({ companyId, reportType: 'scheduled' });

  return createJobOutput({
    success: true,
    result: { itemCount: report.summary.itemCount, customerCount: report.summary.customerCount, refreshedAt: report.generatedAt }
  });
}

export function createRefreshSalesInsightsJob () {
  return createJobDefinition({
    id: JOB_IDS.REFRESH_SALES_INSIGHTS,
    name: 'Refresh Sales Insights',
    version: 1,
    description: 'Invalidates and warms the cached Sales Intelligence summary for the affected company after a new sale or customer, and records the scheduled run via the Audit Platform.',
    triggerEvents: [EVENT_TYPES.SALE_CREATED, EVENT_TYPES.CUSTOMER_CREATED],
    handler
  });
}
