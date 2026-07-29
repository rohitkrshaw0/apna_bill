// api/dashboardApi.js (Milestone 12F)
// The Business Dashboard Services layer -- a new, sibling file to
// api/inventoryIntelligenceApi.js (12A), api/purchaseIntelligenceApi.js
// (12B), api/salesIntelligenceApi.js (12C), api/pricingIntelligenceApi.js
// (12D), and api/supplierIntelligenceApi.js (12E), all frozen, using the
// same `createXApi({..., cache, diagnostics, recordAudit,
// resolveActiveCompanyId})` composition-root shape §5's own header comment
// established for a cross-domain composition root -- five sibling API
// instances injected instead of a `loadSnapshot`, the same structural
// choice api/supplierIntelligenceApi.js made for four.
//
// This file is deliberately thin: it wires
// dashboard/businessSnapshotProvider.js and dashboard/dashboardProvider.js
// together and exposes exactly the three functions this milestone's own
// "PUBLIC API" section names (`getBusinessSnapshot`, `getDashboardSummary`,
// `getDashboardCards`), plus the one audit-triggering wrapper every prior
// domain's own `generateXInsightReport()` established. It contains no
// business logic of its own -- every calculation, every filter, every
// pluck already happened one layer down, in
// dashboard/businessSnapshotProvider.js or dashboard/dashboardProvider.js.

import { inventoryIntelligence } from './inventoryIntelligenceApi.js';
import { purchaseIntelligence } from './purchaseIntelligenceApi.js';
import { salesIntelligence } from './salesIntelligenceApi.js';
import { pricingIntelligence } from './pricingIntelligenceApi.js';
import { supplierIntelligence } from './supplierIntelligenceApi.js';
import { createBusinessSnapshotProvider } from '../dashboard/businessSnapshotProvider.js';
import { createDashboardProvider } from '../dashboard/dashboardProvider.js';
import { createBiDiagnostics, biDiagnostics as sharedBiDiagnostics } from '../diagnostics/biDiagnostics.js';
import { createInsightCache, insightCache as sharedInsightCache } from '../cache/insightCache.js';
import { recordDashboardGenerated } from '../audit/dashboardAuditReporter.js';
import { getActiveCompanyId } from '../../../supabaseClient.js';

/**
 * @param {object} [deps] dependency injection seam for tests/isolated instances
 * @param {typeof inventoryIntelligence} [deps.inventoryIntel]
 * @param {typeof purchaseIntelligence} [deps.purchaseIntel]
 * @param {typeof salesIntelligence} [deps.salesIntel]
 * @param {typeof pricingIntelligence} [deps.pricingIntel]
 * @param {typeof supplierIntelligence} [deps.supplierIntel]
 * @param {ReturnType<typeof createInsightCache>} [deps.cache]
 * @param {ReturnType<typeof createBiDiagnostics>} [deps.diagnostics]
 * @param {typeof recordDashboardGenerated} [deps.recordAudit]
 * @param {() => string|null} [deps.resolveActiveCompanyId]
 */
export function createDashboardApi ({
  inventoryIntel = inventoryIntelligence,
  purchaseIntel = purchaseIntelligence,
  salesIntel = salesIntelligence,
  pricingIntel = pricingIntelligence,
  supplierIntel = supplierIntelligence,
  cache = sharedInsightCache,
  diagnostics = sharedBiDiagnostics,
  recordAudit = recordDashboardGenerated,
  resolveActiveCompanyId = getActiveCompanyId
} = {}) {
  const snapshotProvider = createBusinessSnapshotProvider({
    inventoryIntel, purchaseIntel, salesIntel, pricingIntel, supplierIntel,
    cache, diagnostics, resolveActiveCompanyId
  });
  const dashboardProvider = createDashboardProvider({ snapshotProvider, diagnostics });

  /** @param {{companyId?: string, lookbackDays?: number, useCache?: boolean}} [opts] */
  async function getBusinessSnapshot (opts = {}) {
    return snapshotProvider.getBusinessSnapshot(opts);
  }

  /** @param {{companyId?: string, lookbackDays?: number, useCache?: boolean}} [opts] */
  async function getDashboardSummary (opts = {}) {
    return dashboardProvider.getDashboardSummary(opts);
  }

  /** @param {{companyId?: string, lookbackDays?: number, useCache?: boolean}} [opts] */
  async function getDashboardCards (opts = {}) {
    return dashboardProvider.getDashboardCards(opts);
  }

  /**
   * Generates a full Business Snapshot AND records it in the Audit
   * Platform. `getBusinessSnapshot()`/`getDashboardSummary()`/
   * `getDashboardCards()` above deliberately do NOT call this -- routine
   * dashboard reads are never audited, only an explicit report/export/
   * scheduled-generation invocation is.
   * @param {{companyId?: string, lookbackDays?: number, useCache?: boolean, reportType?: 'onDemand'|'export'|'scheduled'}} [opts]
   */
  async function generateDashboardReport ({ reportType = 'onDemand', ...opts } = {}) {
    const snapshot = await snapshotProvider.getBusinessSnapshot(opts);
    recordAudit({ companyId: snapshot.companyId, reportType, generatedAt: snapshot.generatedAt });
    return snapshot;
  }

  return { getBusinessSnapshot, getDashboardSummary, getDashboardCards, generateDashboardReport };
}

/** The application-wide Business Dashboard API instance, wired to the real, shared Inventory/Purchase/Sales/Pricing/Supplier Intelligence singletons, shared cache, and shared diagnostics. */
export const businessDashboard = createDashboardApi();
