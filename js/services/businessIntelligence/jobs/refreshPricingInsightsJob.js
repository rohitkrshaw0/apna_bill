// jobs/refreshPricingInsightsJob.js (Milestone 12D)
// Mirrors jobs/refreshInventoryInsightsJob.js (12A),
// jobs/refreshPurchaseInsightsJob.js (12B), and
// jobs/refreshSalesInsightsJob.js (12C), all frozen. Reuses the existing
// Background Job Engine to keep the Pricing Intelligence cache warm -- no
// new scheduler, one job registered via
// jobs/bootstrap/startBackgroundInfrastructure.js's own documented
// extension point.
//
// Triggered by SaleCreated and PurchaseCreated -- a pricing insight joins
// both sell-side and buy-side price data (metrics/pricingMetrics.js), so
// either kind of new transaction can change every pricing metric.
// Invalidates the affected company's cached pricing metrics, recomputes
// and re-caches via generatePricingInsightReport({reportType: 'scheduled'})
// (which also records the audit entry).
//
// Same subfolder-import precedent as its three siblings: imports
// jobs/registry/jobIds.js and jobs/contracts/jobContract.js directly,
// never jobs/index.js (circular-import avoidance -- see any sibling's own
// header comment).

import { EVENT_TYPES } from '../../events/index.js';
import { JOB_IDS } from '../../jobs/registry/jobIds.js';
import { createJobDefinition, createJobOutput } from '../../jobs/contracts/jobContract.js';
import { insightCache } from '../cache/insightCache.js';
import { pricingIntelligence } from '../api/pricingIntelligenceApi.js';

/** @param {import('../../jobs/contracts/jobContract.js').JobInput} input */
async function handler ({ event }) {
  const companyId = event.metadata?.company;
  if (!companyId) {
    return createJobOutput({ success: true, result: null, message: 'Event carried no company context -- nothing to refresh.' });
  }

  insightCache.invalidateCompany(companyId);
  const report = await pricingIntelligence.generatePricingInsightReport({ companyId, reportType: 'scheduled' });

  return createJobOutput({
    success: true,
    result: { itemCount: report.summary.itemCount, refreshedAt: report.generatedAt }
  });
}

export function createRefreshPricingInsightsJob () {
  return createJobDefinition({
    id: JOB_IDS.REFRESH_PRICING_INSIGHTS,
    name: 'Refresh Pricing Insights',
    version: 1,
    description: 'Invalidates and warms the cached Pricing Intelligence summary for the affected company after a new sale or purchase, and records the scheduled run via the Audit Platform.',
    triggerEvents: [EVENT_TYPES.SALE_CREATED, EVENT_TYPES.PURCHASE_CREATED],
    handler
  });
}
