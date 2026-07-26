// jobs/refreshPurchaseInsightsJob.js (Milestone 12B)
// Mirrors jobs/refreshInventoryInsightsJob.js's own role and structure from
// 12A (frozen, unmodified by this milestone; this is a new, sibling file).
// Reuses the existing Background Job Engine to keep the Purchase
// Intelligence cache warm -- no new scheduler, one job registered with the
// already-existing jobDispatcher via jobs/bootstrap/startBackgroundInfrastructure.js's
// own documented extension point.
//
// Triggered by PurchaseCreated (a new purchase can change every purchase
// metric) and SupplierCreated (a brand-new supplier has no purchase
// history yet, but warming the cache keeps supplier-scoped views
// consistent from the first purchase onward). Invalidates the affected
// company's cached purchase metrics, recomputes and re-caches via
// generatePurchaseInsightReport({reportType: 'scheduled'}) (which also
// records the audit entry, per audit/purchaseAuditReporter.js).
//
// Note: PurchaseCreated is ALSO one of refreshInventoryInsightsJob.js's own
// trigger events, and both jobs call the SAME shared insightCache's
// invalidateCompany(companyId) -- harmless and correct (a purchase changes
// both inventory levels and purchase-price history for that company), not
// a race or a duplicate side effect worth avoiding.
//
// Same subfolder-import precedent as refreshInventoryInsightsJob.js:
// imports jobs/registry/jobIds.js and jobs/contracts/jobContract.js
// directly, never jobs/index.js (which re-exports FROM bootstrap/ --
// importing it here would be circular).

import { EVENT_TYPES } from '../../events/index.js';
import { JOB_IDS } from '../../jobs/registry/jobIds.js';
import { createJobDefinition, createJobOutput } from '../../jobs/contracts/jobContract.js';
import { insightCache } from '../cache/insightCache.js';
import { purchaseIntelligence } from '../api/purchaseIntelligenceApi.js';

/** @param {import('../../jobs/contracts/jobContract.js').JobInput} input */
async function handler ({ event }) {
  const companyId = event.metadata?.company;
  if (!companyId) {
    return createJobOutput({ success: true, result: null, message: 'Event carried no company context -- nothing to refresh.' });
  }

  insightCache.invalidateCompany(companyId);
  const report = await purchaseIntelligence.generatePurchaseInsightReport({ companyId, reportType: 'scheduled' });

  return createJobOutput({
    success: true,
    result: { itemCount: report.summary.itemCount, supplierCount: report.summary.supplierCount, refreshedAt: report.generatedAt }
  });
}

export function createRefreshPurchaseInsightsJob () {
  return createJobDefinition({
    id: JOB_IDS.REFRESH_PURCHASE_INSIGHTS,
    name: 'Refresh Purchase Insights',
    version: 1,
    description: 'Invalidates and warms the cached Purchase Intelligence summary for the affected company after a new purchase or supplier, and records the scheduled run via the Audit Platform.',
    triggerEvents: [EVENT_TYPES.PURCHASE_CREATED, EVENT_TYPES.SUPPLIER_CREATED],
    handler
  });
}
