// extensions/capabilityNames.js
// Extension points for the Business Intelligence layer (milestone brief
// section "Extension Framework"). This does NOT modify
// js/services/extensions/ itself -- it only names three capability
// strings a future extension may declare in its own
// `createExtensionDefinition({ capabilities: [...] })`, and provides
// read-only discovery helpers over the existing, already-built Capability
// Registry (11F), the same "dumb" discovery-only pattern that registry
// already documents ("does not resolve 'the' provider automatically; a
// consumer decides what to do with however many providers exist").
//
// How a future extension would actually participate:
//   1. Its own ExtensionDefinition declares `capabilities: [BI_CAPABILITIES.INVENTORY_METRIC_PROVIDER]`.
//   2. From its own onStart hook, it subscribes to whatever Domain Events
//      it needs via its ExtensionContext (context.events.subscribe), or
//      exposes its own well-known function some future Dashboard looks up
//      by extension id after calling getInventoryMetricProviders() below.
//   3. This module and the rest of businessIntelligence/ never need to
//      change for a new provider to register -- the same guarantee 11F's
//      own capability registry already gives every other capability name.

export const BI_CAPABILITIES = Object.freeze({
  /** An extension that contributes additional inventory-level insights/facts alongside this platform's own aggregators. */
  INVENTORY_INSIGHT_PROVIDER: 'InventoryInsightProvider',
  /** An extension that contributes an additional per-item metric alongside metrics/itemMetrics.js. */
  INVENTORY_METRIC_PROVIDER: 'InventoryMetricProvider',
  /** An extension that contributes a renderable card for a future Dashboard UI. */
  DASHBOARD_CARD_PROVIDER: 'DashboardCardProvider'
});

/**
 * @param {{capabilityRegistry: {getProviders: (name: string) => string[]}}|null|undefined} extensionRuntime
 * @param {string} capabilityName one of BI_CAPABILITIES's values
 * @returns {string[]} extension ids currently declaring that capability, or [] if no runtime was supplied
 */
function getProvidersOf (extensionRuntime, capabilityName) {
  return extensionRuntime?.capabilityRegistry?.getProviders(capabilityName) || [];
}

/** @param {object} extensionRuntime a js/services/extensions ExtensionLifecycleManager instance */
export function getInventoryInsightProviders (extensionRuntime) {
  return getProvidersOf(extensionRuntime, BI_CAPABILITIES.INVENTORY_INSIGHT_PROVIDER);
}

/** @param {object} extensionRuntime */
export function getInventoryMetricProviders (extensionRuntime) {
  return getProvidersOf(extensionRuntime, BI_CAPABILITIES.INVENTORY_METRIC_PROVIDER);
}

/** @param {object} extensionRuntime */
export function getDashboardCardProviders (extensionRuntime) {
  return getProvidersOf(extensionRuntime, BI_CAPABILITIES.DASHBOARD_CARD_PROVIDER);
}
