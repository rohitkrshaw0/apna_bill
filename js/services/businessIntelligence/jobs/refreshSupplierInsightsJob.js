// jobs/refreshSupplierInsightsJob.js (Milestone 12E)
// Mirrors jobs/refreshInventoryInsightsJob.js (12A),
// jobs/refreshPurchaseInsightsJob.js (12B),
// jobs/refreshSalesInsightsJob.js (12C), and
// jobs/refreshPricingInsightsJob.js (12D), all frozen. Reuses the existing
// Background Job Engine to keep the Supplier Intelligence cache warm -- no
// new scheduler, one job registered via
// jobs/bootstrap/startBackgroundInfrastructure.js's own documented
// extension point.
//
// Triggered by PurchaseCreated and SupplierCreated -- the same two events
// jobs/refreshPurchaseInsightsJob.js (12B) already triggers on, since
// supplier-level data is purchase-anchored (a supplier only exists in this
// domain's own analysis once purchased from). Sales/Pricing/Inventory
// changes are NOT separate triggers here: those three sibling domains
// already warm their own caches on their own triggers, and this domain's
// own 5-minute cache TTL (shared/config.js's DEFAULT_CACHE_TTL_MS) picks up
// any resulting change without a fourth/fifth/sixth trigger event, keeping
// this job's own trigger list as narrow as the brief's own "no new
// scheduler" rule intends.
//
// Invalidates the affected company's cached supplier metrics, recomputes
// and re-caches via generateSupplierInsightReport({reportType:
// 'scheduled'}) (which also records the audit entry).
//
// Same subfolder-import precedent as its four siblings: imports
// jobs/registry/jobIds.js and jobs/contracts/jobContract.js directly,
// never jobs/index.js (circular-import avoidance -- see any sibling's own
// header comment).

import { EVENT_TYPES } from '../../events/index.js';
import { JOB_IDS } from '../../jobs/registry/jobIds.js';
import { createJobDefinition, createJobOutput } from '../../jobs/contracts/jobContract.js';
import { insightCache } from '../cache/insightCache.js';
import { supplierIntelligence } from '../api/supplierIntelligenceApi.js';

/** @param {import('../../jobs/contracts/jobContract.js').JobInput} input */
async function handler ({ event }) {
  const companyId = event.metadata?.company;
  if (!companyId) {
    return createJobOutput({ success: true, result: null, message: 'Event carried no company context -- nothing to refresh.' });
  }

  insightCache.invalidateCompany(companyId);
  const report = await supplierIntelligence.generateSupplierInsightReport({ companyId, reportType: 'scheduled' });

  return createJobOutput({
    success: true,
    result: { supplierCount: report.summary.supplierCount, refreshedAt: report.generatedAt }
  });
}

export function createRefreshSupplierInsightsJob () {
  return createJobDefinition({
    id: JOB_IDS.REFRESH_SUPPLIER_INSIGHTS,
    name: 'Refresh Supplier Insights',
    version: 1,
    description: 'Invalidates and warms the cached Supplier Intelligence summary for the affected company after a new purchase or supplier, and records the scheduled run via the Audit Platform.',
    triggerEvents: [EVENT_TYPES.PURCHASE_CREATED, EVENT_TYPES.SUPPLIER_CREATED],
    handler
  });
}
