// dashboard/dashboardProvider.js (Milestone 12F)
// The SECOND of two new platform concepts this milestone adds. Consumes a
// BusinessSnapshot (dashboard/businessSnapshotProvider.js) and maps it into
// Dashboard Cards -- "No calculations. Only composition." (this milestone's
// own "DASHBOARD PROVIDER" section). Every card's value comes from
// `dashboard/dashboardCardDefinitions.js`'s own static `select(snapshot)`
// function -- this file does not know what a margin %, a turnover ratio, or
// a low-stock threshold means; it only asks the snapshot for the field a
// card definition names and packages the result.
//
// Deliberately does NOT embed `dashboardCards` inside BusinessSnapshot
// itself, despite this milestone's own illustrative example listing
// `dashboardCards` as a BusinessSnapshot field -- the brief's own
// architecture diagram ("Business Intelligence -> Business Snapshot
// Provider -> Dashboard Provider -> Dashboard Components -> UI") and its
// own "Every dashboard card consumes this object [BusinessSnapshot].
// Nothing else." are read here as authoritative over the illustrative
// snippet: cards are DERIVED FROM a snapshot by this file, not stored ON
// it, keeping `businessSnapshotProvider.js` free of any card-shaping
// concern (title strings, `kind` labels) that isn't itself part of the
// company's own business state.

import { businessSnapshotProvider } from './businessSnapshotProvider.js';
import { DASHBOARD_CARD_DEFINITIONS } from './dashboardCardDefinitions.js';
import { deepFreeze } from '../shared/freezeDeep.js';
import { createBiDiagnostics, biDiagnostics as sharedBiDiagnostics } from '../diagnostics/biDiagnostics.js';

/**
 * @param {object} [deps]
 * @param {typeof businessSnapshotProvider} [deps.snapshotProvider]
 * @param {ReturnType<typeof createBiDiagnostics>} [deps.diagnostics]
 */
export function createDashboardProvider ({
  snapshotProvider = businessSnapshotProvider,
  diagnostics = sharedBiDiagnostics
} = {}) {
  /**
   * @param {{companyId?: string, lookbackDays?: number, useCache?: boolean}} [opts]
   * @returns {Promise<object[]>} one frozen Dashboard Card per entry in DASHBOARD_CARD_DEFINITIONS
   */
  async function getDashboardCards (opts = {}) {
    const snapshot = await snapshotProvider.getBusinessSnapshot(opts);
    return diagnostics.time('generateDashboardCards', () => deepFreeze(
      DASHBOARD_CARD_DEFINITIONS.map((def) => ({
        id: def.id,
        title: def.title,
        domain: def.domain,
        kind: def.kind,
        data: def.select(snapshot)
      }))
    ), { itemsAnalyzed: DASHBOARD_CARD_DEFINITIONS.length });
  }

  /**
   * A smaller, headline-only view -- the kpis plus a per-domain alert
   * count, for a Dashboard's own top summary bar. Still zero calculation:
   * `.length` on an already-filtered array is not a new computation any
   * more than reading `.recommendations.length` already was in §4-8's own
   * models.
   * @param {{companyId?: string, lookbackDays?: number, useCache?: boolean}} [opts]
   */
  async function getDashboardSummary (opts = {}) {
    const snapshot = await snapshotProvider.getBusinessSnapshot(opts);
    return diagnostics.time('generateDashboardSummary', () => deepFreeze({
      companyId: snapshot.companyId,
      generatedAt: snapshot.generatedAt,
      lookbackDays: snapshot.lookbackDays,
      kpis: snapshot.kpis,
      alertCounts: {
        inventory: snapshot.alerts.inventory.length,
        purchase: snapshot.alerts.purchase.length,
        sales: snapshot.alerts.sales.length,
        pricing: snapshot.alerts.pricing.length,
        supplier: snapshot.alerts.supplier.length
      }
    }), {});
  }

  return { getDashboardCards, getDashboardSummary };
}

/** The application-wide Dashboard Provider instance, wired to the real, shared BusinessSnapshotProvider and shared diagnostics. */
export const dashboardProvider = createDashboardProvider();
