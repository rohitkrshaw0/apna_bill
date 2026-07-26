// jobs/refreshInventoryInsightsJob.js
// Reuses the existing Background Job Engine (11D) to keep the Inventory
// Intelligence cache warm -- the milestone brief's own words: "If
// expensive calculations exist, cache them using scheduled jobs... DO NOT
// create another scheduler." This file registers ONE job with the
// already-existing jobDispatcher; it does not build a scheduler, a timer,
// or any parallel infrastructure of its own.
//
// Triggered by the four events that can change what an inventory insight
// would say (a stock adjustment, a purchase, a sale, or a new item).
// Invalidates the affected company's cached summary, recomputes it once
// (warming the cache for the next real caller), and records the run via
// biAuditReporter -- the milestone brief's own "Audit only:... Scheduled
// BI jobs" requirement.
//
// Imports events/'s public barrel (safe -- jobs/ itself does the same).
// jobs/ itself, however, is imported from its own subfolders
// (registry/jobIds.js, contracts/jobContract.js) rather than jobs/index.js
// -- exactly the same precedent jobs/jobs/refreshMetricsJob.js and its
// siblings already establish, and for the same reason: this job is
// registered from bootstrap/startBackgroundInfrastructure.js (see that
// file), and jobs/index.js re-exports FROM bootstrap/ -- importing
// jobs/index.js here would be circular (index.js -> bootstrap/ -> this
// file -> index.js).

import { EVENT_TYPES } from '../../events/index.js';
import { JOB_IDS } from '../../jobs/registry/jobIds.js';
import { createJobDefinition, createJobOutput } from '../../jobs/contracts/jobContract.js';
import { insightCache } from '../cache/insightCache.js';
import { inventoryIntelligence } from '../api/inventoryIntelligenceApi.js';

/** @param {import('../../jobs/contracts/jobContract.js').JobInput} input */
async function handler ({ event }) {
  const companyId = event.metadata?.company;
  if (!companyId) {
    return createJobOutput({ success: true, result: null, message: 'Event carried no company context -- nothing to refresh.' });
  }

  insightCache.invalidateCompany(companyId);
  const report = await inventoryIntelligence.generateInventoryInsightReport({ companyId, reportType: 'scheduled' });

  return createJobOutput({
    success: true,
    result: { itemCount: report.summary.itemCount, refreshedAt: report.generatedAt }
  });
}

export function createRefreshInventoryInsightsJob () {
  return createJobDefinition({
    id: JOB_IDS.REFRESH_INVENTORY_INSIGHTS,
    name: 'Refresh Inventory Insights',
    version: 1,
    description: 'Invalidates and warms the cached Inventory Intelligence summary for the affected company after a stock-relevant event, and records the scheduled run via the Audit Platform.',
    triggerEvents: [EVENT_TYPES.STOCK_ADJUSTED, EVENT_TYPES.PURCHASE_CREATED, EVENT_TYPES.SALE_CREATED, EVENT_TYPES.ITEM_CREATED],
    handler
  });
}
