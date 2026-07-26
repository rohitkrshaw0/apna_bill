# Business Intelligence Platform — Public API Reference

**This is a platform contract, not an implementation guide.** Everything documented here
is a stable public interface. It does not repeat implementation rationale — for that, see
`docs/architecture/business-intelligence.md` (the living architecture reference this
document is additive to; it is not renamed, replaced, or superseded by this one).

This document is the **single source of truth for every public Business Intelligence
API**. Future milestones (12C, 12D, 12E, 12F, ...) must extend this document — adding new
sections, new API entries, and filling in the reserved placeholders (§10) — rather than
creating separate API documents. Only APIs that exist today are documented in §§4–5; no
functionality is invented here that the code does not already implement.

## 1. Purpose

The Business Intelligence Platform (`js/services/businessIntelligence/`) is ApnaBill's
read-only analytics layer over the Core ERP Platform. It converts data the ERP already
stores (items, batches, stock movements, purchases, suppliers) into reusable insights —
inventory value, turnover, stock health classification, purchase price history, supplier
comparison, and advisory recommendations — without ever modifying the ERP.

**The BI layer is completely read-only.** No function documented in this file writes to
the database, adjusts stock, creates a purchase order, updates a supplier record, or has
any side effect on business data. The only side effect any function in this platform ever
has is an Audit Platform entry (§3), and that is opt-in per call, never automatic.

**Every consumer of Business Intelligence data goes through this API.** The Dashboard, the
Reports module, a future Mobile App, a future Desktop App, Extensions, and any future
integration all call the functions documented in §§4–5 — none of them recompute a metric,
aggregate raw ERP rows themselves, or import from `metrics/`, `calculators/`, or
`aggregators/` directly. This is what keeps "the Dashboard must never contain
calculations" true as a permanent property of the system, not a one-time convention.

## 2. Architecture

The permanent, unchanging pipeline every Business Intelligence domain (Inventory,
Purchase, and every domain after it) is built on:

```
ERP (read only)
  ↓
Metrics            -- per-item / per-supplier / per-entity numeric facts
  ↓
Calculators         -- pure, reusable arithmetic (no I/O, no formatting)
  ↓
Aggregators         -- combine metrics into lists/summaries; never duplicate calculator logic
  ↓
Insight Models       -- structured, frozen, assembled-only response shapes
  ↓
Business Intelligence APIs   -- the ONLY layer documented in this file (§§4–5)
  ↓
Consumers (Dashboard, Reports, Mobile App, Desktop App, Extensions, future APIs)
```

**Consumers never bypass the Business Intelligence API layer.** A Dashboard card, a
Report, an Extension, or a Mobile/Desktop client calls a function from §4 or §5 — it never
reaches into `metrics/`, `calculators/`, or `aggregators/` on its own, and it never queries
`items`/`batches`/`purchases`/`purchase_lines`/etc. directly. This is enforced by
convention (module boundary, verified by grep in every milestone's own completion report),
not by a runtime guard — but it is a permanent architectural rule, not a suggestion.

## 3. Public API Rules

These rules apply to every function documented in this file, present and future, without
exception:

- **Read-only.** No function ever performs an `insert`/`update`/`delete`/RPC call against
  the database.
- **No database writes.** Confirmed by code review at every milestone (no
  `supa.from(...).insert/update/delete` or `supa.rpc(...)` anywhere under
  `js/services/businessIntelligence/` outside its own, never-executed, disclosed
  boundary — the platform's data loaders (`inventory/inventoryDataLoader.js`,
  `purchase/purchaseDataLoader.js`) issue `select` queries only).
- **No stock updates.** Stock quantities, batches, and the stock ledger are never
  touched.
- **No purchase updates.** Purchases, purchase lines, and supplier records are never
  touched.
- **No sales updates.** Invoices and invoice lines are never touched.
- **No side effects**, with one narrow, disclosed exception: `generateXInsightReport()`
  functions (§§4, 5) publish one Audit Platform Domain Event per call. This is the *only*
  side effect any function in this file ever has, and it never mutates business data —
  it only appends an immutable audit record via the existing Audit Platform.
- **Pure data retrieval.** Every other function's only effect is populating this
  platform's own in-memory cache (§7) — never anything externally observable.
- **Stable contracts.** A function name, its parameter shape, and its return shape,
  once documented here, do not change without a version bump (§9). A field is never
  silently removed or repurposed to mean something different.
- **Backward compatibility.** New optional parameters and new fields on a returned model
  may be added freely (additive). Removing or renaming an existing parameter or field
  requires a major version bump (§9) and an explicit migration note in this document.
- **Versioning policy.** See §9. Every new domain (Purchase, Sales, Pricing, Supplier,
  ...) is a minor version bump on the same platform, not a new, parallel API surface.

## 4. Inventory Intelligence APIs

Public API surface: `import { inventoryIntelligence, createInventoryIntelligenceApi }
from 'js/services/businessIntelligence/index.js'`. All functions below are methods on
the `inventoryIntelligence` singleton (or an instance returned by
`createInventoryIntelligenceApi(deps)` — see §7 for the dependency-injection contract).
Every `opts` parameter below defaults to `{}` and every field within it is optional.

**Shared `opts` shape across every function in this section:**
```
{
  companyId?:  string   // defaults to the active company (see "Possible errors" below)
  lookbackDays?: number  // defaults to DEFAULT_LOOKBACK_DAYS = 365 (§7)
  activeOnly?: boolean   // defaults to true -- only active items are scanned
  useCache?:  boolean    // defaults to true
  // plus any MOVEMENT_DEFAULTS / REORDER_DEFAULTS override (§7)
}
```

**Shared "Possible errors" across every function in this section:** throws a plain
`Error` with message `"businessIntelligence: no active company"` if `companyId` is
omitted and no active company can be resolved. This is the only error condition any of
these functions raise deliberately — an underlying Supabase query failure (network,
auth, etc.) propagates unchanged, not caught or normalized.

**Shared "Diagnostics emitted" across every function in this section:** one
`bi:<functionName>` timeline entry (execution time, success/failure) via the shared
`biDiagnostics` instance, plus one cache-hit or cache-miss log line for the underlying
scan step. See §7 for the full diagnostics contract.

---

#### `getItemMetricsSnapshot(opts)`

**Purpose:** The internal "one scan, compute metrics once" composition step every other
function in this section calls first. Exposed on the returned API object for advanced
use (tests, a future caller that wants the raw per-item metric array without a
higher-level model wrapped around it) — not typically called directly by a Dashboard.

**Input:** `{ companyId?, lookbackDays?, activeOnly?, useCache? }`

**Output:** `Promise<{ companyId, generatedAt, lookbackDays, itemMetrics: ItemMetric[] }>`
(see §6 for the `ItemMetric` row shape).

**Returned model:** none (a plain bundle, not a frozen Insight Model).

**Caching behavior:** the cache key is `` `itemMetrics:${lookbackDays}:${activeOnly}` ``,
scoped per company. A cache hit returns the exact previously-computed bundle; a miss
re-scans and re-computes, then stores the result for `DEFAULT_CACHE_TTL_MS` (§7).

**Example usage:**
```js
const { itemMetrics } = await inventoryIntelligence.getItemMetricsSnapshot({ companyId: 'co-1' });
```

---

#### `getInventorySummary(opts)`

**Purpose:** The full, company-wide inventory health report — the one function a
Dashboard's main inventory overview should call.

**Input:** `{ companyId?, lookbackDays?, activeOnly?, useCache? }`

**Output:** `Promise<InventoryInsightModel>` (§6).

**Caching behavior:** reuses the same `itemMetrics:${lookbackDays}:${activeOnly}` cache
entry `getItemMetricsSnapshot` populates; the aggregation/model-building step itself is
never cached (cheap, recomputed every call from the cached metrics array).

**Example usage:**
```js
const summary = await inventoryIntelligence.getInventorySummary({ companyId: 'co-1' });
console.log(summary.inventoryValue.totalInventoryValue, summary.lowStock.length);
```

---

#### `getInventoryValue(opts)`

**Purpose:** Just the inventory valuation figures, without the full summary's other
lists — cheaper to consume when only the headline number is needed.

**Input:** `{ companyId?, lookbackDays?, activeOnly?, useCache? }`

**Output:** `Promise<InventoryValueModel>` (§6).

**Example usage:**
```js
const value = await inventoryIntelligence.getInventoryValue({ companyId: 'co-1' });
```

---

#### `getLowStockItems(opts)` / `getOutOfStockItems(opts)` / `getDeadStock(opts)` / `getSlowMovingItems(opts)` / `getFastMovingItems(opts)` / `getOverstockItems(opts)`

**Purpose:** Six independent stock-health classifications, one item list each — low
stock (at or below `low_stock_threshold`), out of stock (zero/negative stock),
dead stock (no sale observed within `deadStockDays`), slow-moving (turnover below
`slowMovingMaxTurnsPerYear`), fast-moving (turnover at/above `fastMovingMinTurnsPerYear`),
overstock (days-of-cover above `overstockDaysOfCover`). Dead stock always takes
precedence — an item classified dead is never also counted slow-moving or overstocked.

**Input:** `{ companyId?, lookbackDays?, activeOnly?, useCache?, ...MOVEMENT_DEFAULTS overrides }`
(`getLowStockItems`/`getOutOfStockItems` take no movement-threshold overrides — those two
classifications have no tunable threshold beyond the item's own `low_stock_threshold`).

**Output:** `Promise<ItemMetric[]>` — `getLowStockItems` sorted lowest stock first;
`getOutOfStockItems` sorted by name; `getDeadStock` sorted most-stale first;
`getSlowMovingItems` sorted lowest turnover first; `getFastMovingItems` sorted highest
turnover first; `getOverstockItems` sorted highest days-of-cover first.

**Example usage:**
```js
const low = await inventoryIntelligence.getLowStockItems({ companyId: 'co-1' });
const dead = await inventoryIntelligence.getDeadStock({ companyId: 'co-1', deadStockDays: 90 });
```

---

#### `getCategoryPerformance(opts)`

**Purpose:** Per-category (hsn_sac proxy, §6 "Known limitations") stock and value
totals, highest inventory value first.

**Input:** `{ companyId?, lookbackDays?, activeOnly?, useCache? }`

**Output:** `Promise<CategorySummary[]>` (Inventory variant, §6).

**Example usage:**
```js
const categories = await inventoryIntelligence.getCategoryPerformance({ companyId: 'co-1' });
```

---

#### `getInventoryTurnover(opts)`

**Purpose:** The single, company-wide annualized turnover ratio.

**Input:** `{ companyId?, lookbackDays?, activeOnly?, useCache? }`

**Output:** `Promise<number|null>` — `null` only when total inventory value is 0 (nothing
to compare COGS against).

**Example usage:**
```js
const turnover = await inventoryIntelligence.getInventoryTurnover({ companyId: 'co-1' });
```

---

#### `getReorderRecommendations(opts)`

**Purpose:** Actionable reorder recommendations only (urgent/high/normal priority, or
flagged as potential excess/dead inventory) — never the full per-item recommendation
list including "priority: none, nothing flagged" rows.

**Input:** `{ companyId?, lookbackDays?, activeOnly?, useCache?, ...REORDER_DEFAULTS overrides }`

**Output:** `Promise<{ recommendations: Recommendation[] (Inventory variant, §6, sorted
most urgent first), urgentCount, highCount, normalCount, potentialExcessCount,
potentialDeadCount }>`.

**Example usage:**
```js
const reorder = await inventoryIntelligence.getReorderRecommendations({ companyId: 'co-1' });
```

---

#### `generateInventoryInsightReport(opts)`

**Purpose:** Identical to `getInventorySummary()`, with one addition: records an Audit
Platform entry. Use this — never `getInventorySummary()` — when the caller is generating
an on-demand report, a dashboard export, or a scheduled job's own report (the only three
things this platform audits, per §1/§3).

**Input:** `{ companyId?, lookbackDays?, activeOnly?, useCache?, reportType?:
'onDemand'|'export'|'scheduled' }` — `reportType` defaults to `'onDemand'`.

**Output:** `Promise<InventoryInsightModel>` — the exact same model
`getInventorySummary()` returns.

**Side effect:** publishes `EVENT_TYPES.INVENTORY_INSIGHT_GENERATED` (a real Domain
Event) with `{ reportType, itemsAnalyzed, generatedAt }`, which the existing Audit
Platform observes like any other event. Does not write an audit record directly.

**Example usage:**
```js
const report = await inventoryIntelligence.generateInventoryInsightReport({ companyId: 'co-1', reportType: 'export' });
```

## 5. Purchase Intelligence APIs

Public API surface: `import { purchaseIntelligence, createPurchaseIntelligenceApi } from
'js/services/businessIntelligence/index.js'`. Same shared-instance/factory shape as §4.

**Shared `opts` shape across every function in this section:**
```
{
  companyId?:  string
  lookbackDays?: number  // defaults to DEFAULT_LOOKBACK_DAYS = 365 (§7)
  useCache?:  boolean    // defaults to true
  // plus any PURCHASE_DEFAULTS override (§7)
}
```
Functions that operate on one item additionally take `itemId: string` as a required
sibling field on the same options object (not a separate positional argument).

**Shared "Possible errors":** identical to §4 — throws `Error("businessIntelligence: no
active company")` when no company can be resolved; nothing else deliberately thrown.

**Shared "Diagnostics emitted":** identical shape to §4, one `bi:<functionName>` timeline
entry per call via the SAME shared `biDiagnostics` instance §4 uses (one diagnostics
recorder for the whole platform, not one per domain).

**Shared "Caching behavior":** the underlying scan/metrics bundle
(`{ snapshot, purchaseMetrics, supplierMetrics }`) is cached under a
`` `purchaseMetrics:${lookbackDays}` `` key in the SAME shared cache instance §4 uses —
collision-free because this prefix is textually distinct from §4's own
`itemMetrics:...` prefix. Every function below reuses that one cached bundle; only
`getPurchaseMetricsSnapshot` itself performs the cache lookup/scan/store.

---

#### `getPurchaseMetricsSnapshot(opts)`

**Purpose:** The internal composition step (mirrors §4's `getItemMetricsSnapshot`).

**Input:** `{ companyId?, lookbackDays?, useCache? }`

**Output:** `Promise<{ companyId, generatedAt, lookbackDays, snapshot: PurchaseSnapshot,
purchaseMetrics: PurchaseMetric[], supplierMetrics: SupplierMetric[] }>` — the raw
`snapshot` is included (unlike §4's equivalent) because three aggregators
(`supplierComparisonAggregator`, `preferredSupplierAggregator`, `costHistoryAggregator`)
need the per-supplier, per-item breakdown `purchaseMetrics` deliberately aggregates away.

**Example usage:**
```js
const { purchaseMetrics } = await purchaseIntelligence.getPurchaseMetricsSnapshot({ companyId: 'co-1' });
```

---

#### `getPurchaseSummary(opts)`

**Purpose:** The full, company-wide purchase report — the one function a Dashboard's
main purchasing overview should call.

**Input:** `{ companyId?, lookbackDays?, useCache?, ...PURCHASE_DEFAULTS overrides }`

**Output:** `Promise<PurchaseSummaryModel>` (§6).

**Example usage:**
```js
const summary = await purchaseIntelligence.getPurchaseSummary({ companyId: 'co-1' });
```

---

#### `getAveragePurchasePrice({ itemId, ...opts })`

**Purpose:** The qty-weighted average price paid for one item across every supplier,
within the lookback window.

**Input:** `{ itemId: string, companyId?, lookbackDays?, useCache? }`

**Output:** `Promise<number|null>` — `null` if the item was never purchased within the
window.

**Example usage:**
```js
const avg = await purchaseIntelligence.getAveragePurchasePrice({ companyId: 'co-1', itemId: 'item-1' });
```

---

#### `getPurchaseHistory({ itemId, ...opts })`

**Purpose:** The full per-item purchase insight — price history, supplier comparison,
cost trend, preferred supplier, and this item's own recommendation, in one call.

**Input:** `{ itemId: string, companyId?, lookbackDays?, useCache?, ...PURCHASE_DEFAULTS overrides }`

**Output:** `Promise<ItemPurchaseInsightModel>` (§6). Every metric-derived field is
`null` (and `priceHistory`/`supplierComparison` are `[]`, `preferredSupplier`/
`recommendations` are `null`) if the item was never purchased within the window — this
never throws for an unknown/never-purchased item.

**Example usage:**
```js
const history = await purchaseIntelligence.getPurchaseHistory({ companyId: 'co-1', itemId: 'item-1' });
```

---

#### `getCostHistory({ itemId, ...opts })`

**Purpose:** Just the raw, chronological price/quantity history for one item — cheaper
to consume than `getPurchaseHistory()` when only the history array (e.g. for a chart) is
needed.

**Input:** `{ itemId: string, companyId?, lookbackDays?, useCache? }`

**Output:** `Promise<{ date: string, rate: number, qty: number, purchaseId: string,
supplierId: string|null }[]>`, oldest first.

**Example usage:**
```js
const points = await purchaseIntelligence.getCostHistory({ companyId: 'co-1', itemId: 'item-1' });
```

---

#### `getPurchaseTrends(opts)`

**Purpose:** Company-wide cost-trend classification — how many items are rising,
falling, stable, or have insufficient purchase history to classify.

**Input:** `{ companyId?, lookbackDays?, useCache? }`

**Output:** `Promise<{ rising: PurchaseMetric[], falling: PurchaseMetric[], stable:
PurchaseMetric[], insufficientData: PurchaseMetric[], risingCount, fallingCount,
stableCount, insufficientDataCount }>`.

**Example usage:**
```js
const trends = await purchaseIntelligence.getPurchaseTrends({ companyId: 'co-1' });
```

---

#### `getSupplierComparison({ itemId, ...opts })`

**Purpose:** Every supplier this item was bought from, ranked cheapest first.

**Input:** `{ itemId: string, companyId?, lookbackDays?, useCache? }`

**Output:** `Promise<SupplierComparison[]>` (§6), cheapest average price first. `[]` if
the item was never purchased from a known supplier.

**Example usage:**
```js
const comparison = await purchaseIntelligence.getSupplierComparison({ companyId: 'co-1', itemId: 'item-1' });
```

---

#### `getSupplierRanking(opts)`

**Purpose:** Every supplier purchased from within the window, ranked (default: by total
spend, descending).

**Input:** `{ companyId?, lookbackDays?, useCache?, by?: 'purchaseValue'|'purchaseCount'|'avgOrderValue' }`
(`by` defaults to `'purchaseValue'`).

**Output:** `Promise<SupplierMetric[]>` (§6), sorted descending by the chosen field.

**Example usage:**
```js
const ranking = await purchaseIntelligence.getSupplierRanking({ companyId: 'co-1', by: 'purchaseCount' });
```

---

#### `getPreferredSupplier({ itemId, ...opts })`

**Purpose:** The single cheapest supplier for one item.

**Input:** `{ itemId: string, companyId?, lookbackDays?, useCache? }`

**Output:** `Promise<SupplierComparison|null>` (§6) — `null` if never purchased from a
known supplier.

**Example usage:**
```js
const preferred = await purchaseIntelligence.getPreferredSupplier({ companyId: 'co-1', itemId: 'item-1' });
```

---

#### `getPurchaseFrequency({ itemId?, ...opts })`

**Purpose:** Dual-mode: per-item annualized purchase frequency when `itemId` is given,
or the company-wide high/low frequency bucket summary when it is omitted.

**Input:** `{ itemId?: string, companyId?, lookbackDays?, useCache?,
highFrequencyPurchasesPerYear?, lowFrequencyPurchasesPerYear? }`

**Output:** with `itemId`: `Promise<number|null>` (purchases per year, annualized; `null`
if never purchased). Without `itemId`: `Promise<{ highFrequency: PurchaseMetric[],
lowFrequency: PurchaseMetric[], highFrequencyCount, lowFrequencyCount }>`.

**Example usage:**
```js
const perItem = await purchaseIntelligence.getPurchaseFrequency({ companyId: 'co-1', itemId: 'item-1' });
const companyWide = await purchaseIntelligence.getPurchaseFrequency({ companyId: 'co-1' });
```

---

#### `getTopPurchasedItems(opts)`

**Purpose:** The top N items by value, quantity, or purchase count.

**Input:** `{ companyId?, lookbackDays?, useCache?, topN?: number, by?:
'purchaseValue'|'purchaseQty'|'purchaseCount' }` (`topN` defaults to `10`, `by` defaults
to `'purchaseValue'`).

**Output:** `Promise<PurchaseMetric[]>` (§6), length at most `topN`, descending by `by`.

**Example usage:**
```js
const top5 = await purchaseIntelligence.getTopPurchasedItems({ companyId: 'co-1', topN: 5 });
```

---

#### `getCategoryPurchases(opts)`

**Purpose:** Per-category purchase totals, highest spend first — also serves "highest
spend categories" (no separate function needed).

**Input:** `{ companyId?, lookbackDays?, useCache? }`

**Output:** `Promise<CategorySummary[]>` (Purchase variant, §6).

**Example usage:**
```js
const categories = await purchaseIntelligence.getCategoryPurchases({ companyId: 'co-1' });
```

---

#### `getPurchaseRecommendations(opts)`

**Purpose:** One advisory recommendation per item purchased within the window — never
filtered to "actionable only" the way §4's `getReorderRecommendations()` is (every item
gets a row; most fields will simply be `false`/`'none'` for a healthy item).

**Input:** `{ companyId?, lookbackDays?, useCache?, ...PURCHASE_DEFAULTS overrides }`

**Output:** `Promise<Recommendation[]>` (Purchase variant, §6), one per item.

**Example usage:**
```js
const recs = await purchaseIntelligence.getPurchaseRecommendations({ companyId: 'co-1' });
```

---

#### `generatePurchaseInsightReport(opts)`

**Purpose:** Identical to `getPurchaseSummary()`, plus an Audit Platform entry. Same
audit-boundary rule as §4's `generateInventoryInsightReport()`.

**Input:** `{ companyId?, lookbackDays?, useCache?, reportType?:
'onDemand'|'export'|'scheduled' }` — `reportType` defaults to `'onDemand'`.

**Output:** `Promise<PurchaseSummaryModel>` — the exact same model `getPurchaseSummary()`
returns.

**Side effect:** publishes `EVENT_TYPES.PURCHASE_INSIGHT_GENERATED` with `{ reportType,
itemsAnalyzed, suppliersCompared, generatedAt }`.

**Example usage:**
```js
const report = await purchaseIntelligence.generatePurchaseInsightReport({ companyId: 'co-1', reportType: 'scheduled' });
```

## 6. Shared Models

Every model below is produced by a `build*Model()` function under `models/` and is
**deep-frozen** (`Object.isFrozen(model) === true`, recursively) before being returned —
no consumer can mutate a returned model, by design.

### ItemMetric (row shape — Inventory)

One row per item, returned raw by `getLowStockItems`/`getOutOfStockItems`/`getDeadStock`/
`getSlowMovingItems`/`getFastMovingItems`/`getOverstockItems`, and embedded in
`InventoryInsightModel`'s list fields:

```
itemId, code, name, kind, unit, category, isActive, trackStock, trackBatches, lowStockThreshold,
currentStock, availableStock, reservedStock,
inventoryValue, avgCost, avgSellingPrice,
lastPurchaseDate, lastSaleDate, daysSinceLastPurchase, daysSinceLastSale,
stockAgeDays,
qtySoldInWindow, qtyPurchasedInWindow, cogsInWindow, dailySalesVelocity, daysOfCover, turnoverRatio
```
`reservedStock` is always `0` (this schema has no reservation/sales-order concept —
`availableStock` always equals `currentStock`).

### InventoryValue

Returned by `getInventoryValue()`:
```
companyId, generatedAt, lookbackDays,
totalInventoryValue, avgInventoryValuePerItem, trackedItemCount, totalStockQty
```

### InventorySummary (internal aggregate, embedded as `.summary` on InventoryInsightModel)

```
itemCount, trackedItemCount, totalStockQty, totalInventoryValue, avgInventoryValuePerItem,
totalCogsInWindow, overallTurnoverRatio,
lowStockCount, outOfStockCount, deadStockCount, slowMovingCount, fastMovingCount, overstockCount
```

### InventoryInsightModel

Returned by `getInventorySummary()` and `generateInventoryInsightReport()`:
```
companyId, generatedAt, lookbackDays,
inventoryValue: { totalInventoryValue, avgInventoryValuePerItem, trackedItemCount, totalStockQty },
stockTurnover:  { overallTurnoverRatio, totalCogsInWindow, lookbackDays },
summary: InventorySummary,
lowStock: ItemMetric[], outOfStock: ItemMetric[], deadStock: ItemMetric[],
slowMoving: ItemMetric[], fastMoving: ItemMetric[], overstock: ItemMetric[],
categoryPerformance: CategorySummary[] (Inventory variant),
recommendations: { recommendations: Recommendation[] (Inventory variant), urgentCount, highCount, normalCount, potentialExcessCount, potentialDeadCount }
```

### CategorySummary (Inventory variant)

Row shape returned by `getCategoryPerformance()`, one per hsn_sac-proxy category:
```
category, itemCount, totalStockQty, totalInventoryValue, qtySoldInWindow, avgTurnoverRatio
```

### CategorySummary (Purchase variant)

Row shape returned by `getCategoryPurchases()`:
```
category, itemCount, totalPurchaseQty, totalPurchaseValue, avgPurchasePrice
```

### Recommendation (Inventory variant)

Row shape inside `getReorderRecommendations()`'s `.recommendations` array:
```
itemId, name, code, currentStock, lowStockThreshold, targetStockLevel, recommendedReorderQty,
priority: 'urgent'|'high'|'normal'|'none', timing: 'reorderNow'|'reorderSoon'|'monitor'|'none',
potentialExcessInventory, potentialDeadInventory
```

### PurchaseMetric (row shape — Purchase)

One row per item, returned raw by `getTopPurchasedItems`, embedded in `getPurchaseTrends`'s
buckets, `getPurchaseRecommendations` (via the Recommendation it's built from), etc.:

```
itemId, name, category,
purchaseCount, purchaseQty, purchaseValue,
avgPurchasePrice, lastPurchasePrice, highestPurchasePrice, lowestPurchasePrice,
lastPurchaseDate, daysSinceLastPurchase,
purchaseFrequency, purchaseFrequencyPerYear, avgDaysBetweenPurchases, rollingPurchaseAverage,
costTrend: 'rising'|'falling'|'stable'|'insufficientData', costTrendChangePct,
recentAvgPrice, olderAvgPrice
```

### SupplierMetric (row shape — Purchase)

One row per supplier, returned raw by `getSupplierRanking()`:
```
supplierId, name, isActive,
purchaseCount, purchaseValue, avgOrderValue,
lastPurchaseDate, daysSinceLastPurchase,
purchaseFrequency, purchaseFrequencyPerYear
```

### SupplierComparison

Row shape returned by `getSupplierComparison()` and `getPreferredSupplier()`:
```
supplierId, supplierName, purchaseCount, totalQty, avgPrice, lastPrice
```

### Recommendation (Purchase variant)

Row shape returned by `getPurchaseRecommendations()`:
```
itemId, name,
preferredSupplier: SupplierComparison|null,
supplierConsolidationOpportunity, betterCostOpportunity, bulkPurchaseOpportunity,
priceIncreaseWarning, priceDropOpportunity,
highFrequencyAlert, lowFrequencyAlert
```

### PurchaseSummary (internal aggregate, embedded as `.summary` on PurchaseSummaryModel)

```
itemCount, supplierCount, totalPurchaseQty, totalPurchaseValue, totalPurchaseCount, avgPurchasePrice,
risingCostCount, fallingCostCount, stableCostCount,
highFrequencyItemCount, lowFrequencyItemCount, highFrequencySupplierCount, lowFrequencySupplierCount
```

### PurchaseSummaryModel

Returned by `getPurchaseSummary()` and `generatePurchaseInsightReport()`:
```
companyId, generatedAt, lookbackDays,
summary: PurchaseSummary,
categoryPerformance: CategorySummary[] (Purchase variant),
purchaseTrend: { rising, falling, stable, insufficientData, risingCount, fallingCount, stableCount, insufficientDataCount },
purchaseFrequency: { highFrequency, lowFrequency, highFrequencyCount, lowFrequencyCount },
supplierRanking: SupplierMetric[],
topPurchasedItems: PurchaseMetric[],
recommendations: Recommendation[] (Purchase variant)
```

### ItemPurchaseInsightModel

Returned by `getPurchaseHistory()`:
```
companyId, generatedAt, lookbackDays, itemId,
averagePurchasePrice, lastPurchasePrice, highestPurchasePrice, lowestPurchasePrice, rollingPurchaseAverage,
priceHistory: { date, rate, qty, purchaseId, supplierId }[],
supplierComparison: SupplierComparison[],
purchaseTrend, costTrend, costTrendChangePct,
purchaseFrequency,
preferredSupplier: SupplierComparison|null,
recommendations: Recommendation|null (Purchase variant, singular -- one item's own recommendation, not a list)
```

### InsightReport (concept, not a distinct shape)

"InsightReport" names the *pattern*, not a fifth model: `generateInventoryInsightReport()`
returns exactly an `InventoryInsightModel`; `generatePurchaseInsightReport()` returns
exactly a `PurchaseSummaryModel`. The only difference from calling
`getInventorySummary()`/`getPurchaseSummary()` directly is the Audit Platform side
effect (§1, §3) — there is no separate "InsightReport" wrapper type.

### BusinessSnapshot — **RESERVED, NOT YET IMPLEMENTED**

No function in this platform returns a cross-domain "BusinessSnapshot" combining
Inventory and Purchase (and future Sales/Pricing/Supplier) data in one call. Reserved
here as a named placeholder for a future milestone (most likely the Business Dashboard,
§10) that needs one combined snapshot rather than calling each domain's own
`getXSummary()` independently.

## 7. Shared Configuration

Single source of truth: `js/services/businessIntelligence/shared/config.js`. Every value
below is overridable per call via the relevant function's `opts` — nothing here is a
hardcoded, unconfigurable limit.

**Calendar constants:**
| Constant | Value | Used for |
|---|---|---|
| `MS_PER_DAY` | `86400000` | Every age/days-since calculation |
| `DAYS_PER_YEAR` | `365` | Annualizing a turnover or frequency ratio |

**Defaults:**
| Constant | Value | Used for |
|---|---|---|
| `DEFAULT_LOOKBACK_DAYS` | `365` | Default `lookbackDays` for every `opts` shape in §§4–5 |
| `DEFAULT_CACHE_TTL_MS` | `300000` (5 min) | Default cache entry lifetime (§ below) |

**`MOVEMENT_DEFAULTS`** (Inventory movement classification — §4):
`deadStockDays: 180`, `slowMovingMaxTurnsPerYear: 2`, `fastMovingMinTurnsPerYear: 12`,
`overstockDaysOfCover: 90`.

**`REORDER_DEFAULTS`** (Inventory reorder recommendations — §4):
`leadTimeDays: 7`, `safetyStockDays: 7`, `noVelocityRestockMultiplier: 2`.

**`PURCHASE_DEFAULTS`** (Purchase Intelligence — §5):
`rollingAverageWindow: 5`, `trendThresholdPct: 5`, `minSuppliersForConsolidation: 3`,
`betterCostThresholdPct: 5`, `highFrequencyPurchasesPerYear: 24`,
`lowFrequencyPurchasesPerYear: 2`.

**Cache durations:** one shared, in-memory, TTL-based cache
(`cache/insightCache.js`'s `insightCache` singleton) serves both Inventory (`itemMetrics:...`
keys) and Purchase (`purchaseMetrics:...` keys) Intelligence. Default TTL:
`DEFAULT_CACHE_TTL_MS` (5 minutes), configurable per cache instance via
`createInsightCache({ ttlMs })`. Expiry is lazy (checked on read, not swept by a timer).
Invalidation: `insightCache.invalidateCompany(companyId)` clears every cached entry for
that company across BOTH domains — called automatically by
`refreshInventoryInsightsJob`/`refreshPurchaseInsightsJob` (§ below) on the relevant
Domain Events. `useCache: false` bypasses the cache for a single call without evicting
anything.

**Background refresh (Job Engine reuse):** two registered jobs keep the cache warm —
`refreshInventoryInsightsJob` (triggers: `StockAdjusted`, `PurchaseCreated`,
`SaleCreated`, `ItemCreated`) and `refreshPurchaseInsightsJob` (triggers:
`PurchaseCreated`, `SupplierCreated`). Both registered via
`jobs/bootstrap/startBackgroundInfrastructure()`. Neither is itself a public
Business Intelligence API — they run automatically once a session starts.

**Diagnostics:** one shared `biDiagnostics` instance (`diagnostics/biDiagnostics.js`)
records every call in this document: `bi:<functionName>` timeline entries (execution
time, success/failure), a metrics sample per call, cache-hit/cache-miss counts and log
lines, and a `warnings` meta field when a function's own diagnostics call includes one.
Read via `biDiagnostics.stats()` — not itself part of the public consumer-facing API
surface in §§4–5, but available to a future Diagnostics Dashboard.

**Extension points:** see §8.

## 8. Extension Contracts

The Business Intelligence Platform exposes exactly three named capabilities a future
extension may declare, via `js/services/businessIntelligence/extensions/capabilityNames.js`'s
`BI_CAPABILITIES`:

| Capability | Meaning |
|---|---|
| `InventoryInsightProvider` | Contributes additional inventory-level insights/facts alongside this platform's own aggregators |
| `InventoryMetricProvider` | Contributes an additional per-item metric alongside `metrics/itemMetrics.js` |
| `DashboardCardProvider` | Contributes a renderable card for a future Dashboard UI (covers Purchase-facing dashboard needs too — no separate `PurchaseMetricProvider` exists, deliberately, §20.7 of `business-intelligence.md`) |

**How an extension participates:**
1. Declare the capability in its own `ExtensionDefinition`:
   `createExtensionDefinition({ ..., capabilities: [BI_CAPABILITIES.INVENTORY_METRIC_PROVIDER] })`.
2. From its own `onStart` hook, subscribe to whatever Domain Events it needs via its own
   `ExtensionContext` (`context.events.subscribe(...)`), or expose its own well-known
   function that a future Dashboard looks up by extension id after calling one of:
   `getInventoryInsightProviders(extensionRuntime)`,
   `getInventoryMetricProviders(extensionRuntime)`,
   `getDashboardCardProviders(extensionRuntime)` — each returns the list of extension ids
   currently declaring that capability (`[]` if none, never throws).
3. Nothing under `businessIntelligence/` needs to change for a new provider to register.

**Prohibited extension behavior** (enforced by the existing Extension Framework's own
architecture, restated here for this platform's context):
- An extension may **not** write to any table this platform reads from.
- An extension may **not** call any `getX()`/`generateX()` function documented here with
  the intent of causing a side effect beyond the one disclosed audit event — this API
  surface is read-only for every caller, extensions included.
- An extension may **not** register a new Domain Event *type* through
  `context.events.publish()` — `events/registry/eventTypes.js` is a closed catalog; only
  a code change to that registry (not an extension) can add one.
- An extension may **not** register a Business Intelligence job through the Job
  Dispatcher — `context.jobs` is read-only observation
  (`getRunHistory()`/`isRunning()`), never `registerJob()` (a Job Engine-wide rule, not
  specific to this platform).
- A future capability name for this platform must be added to
  `capabilityNames.js`'s `BI_CAPABILITIES` **and this document (§8)** — never invented
  ad hoc by an individual extension.

## 9. Versioning Policy

The Business Intelligence Platform uses semantic versioning at the **platform** level —
one version number for the whole platform, not one per domain:

| Version | Delivered |
|---|---|
| **v1.0** | Inventory Intelligence (Milestone 12A) |
| **v1.1** | Purchase Intelligence (Milestone 12B) |
| v1.2 (reserved) | Sales Intelligence (Milestone 12C, §10) |
| v1.3 (reserved) | Pricing Intelligence (§10) |
| v1.4 (reserved) | Supplier Intelligence (§10) |
| v2.0 (reserved) | Business Dashboard (§10) |

**Rule: a new minor version adds a new domain's APIs to this same document — it never
creates a parallel API document or a differently-shaped composition root.** Every future
domain must reuse the `createXApi({ loadSnapshot, cache, diagnostics, recordAudit,
resolveActiveCompanyId })` shape §§4–5 already establish, the same shared
cache/diagnostics singletons (namespaced by a distinct cache-key prefix), and the same
three registry-extension points (a new Domain Event type, a new Job Engine registration,
zero new capability names unless genuinely necessary) — exactly as Purchase Intelligence
(v1.1) did against Inventory Intelligence (v1.0).

**A major version bump (v2.0) is reserved for a genuinely new consumption model** — the
Business Dashboard, which is expected to be the first consumer requiring a
`BusinessSnapshot` (§6) style combined read across domains, not a new computation domain
itself.

**Backward compatibility within a version:** see §3. A patch-level change (bug fix,
internal refactor with no observable behavior change) requires no version bump and no
change to this document. Any additive change (new optional parameter, new field on a
model) requires updating this document's relevant section but not a version bump. Any
breaking change (renamed/removed function, parameter, or field) requires a version bump
and an explicit note in this document's version table.

## 10. Future Reserved APIs

The following sections are placeholders only — **no implementation exists yet for any of
these**. They exist so a future milestone extends this document in place rather than
restructuring it. Do not implement functionality described here without a corresponding
milestone actually building it; update these sections to move out of "reserved" only once
real code exists, following the exact per-function documentation structure §§4–5 use.

### 10.1 Sales Intelligence (reserved for Milestone 12C, BI Platform v1.2)

Not implemented. Expected shape (per `docs/reports/milestone-12b-completion.md`'s own
readiness assessment): `sales/salesDataLoader.js` over `invoices`/`invoice_lines`/
`parties` (as customers), `metrics/salesMetrics.js`/`metrics/customerMetrics.js` reusing
`calculators/categoryCalculator.js` and `calculators/turnoverCalculator.js` as-is, its own
aggregators/recommendations/models, and `api/salesIntelligenceApi.js` with a
`salesMetrics:...` cache-key prefix on the same shared cache/diagnostics instances.

### 10.2 Pricing Intelligence (reserved, BI Platform v1.3)

Not implemented. No design work has been done for this domain yet.

### 10.3 Supplier Intelligence (reserved, BI Platform v1.4)

Not implemented. Note: Purchase Intelligence (v1.1) already includes supplier-level
metrics and aggregators (`metrics/supplierMetrics.js`, `getSupplierRanking`,
`getSupplierComparison`, `getPreferredSupplier`) scoped to *purchase* behavior. A future
Supplier Intelligence domain would need to define what it adds beyond that scope (e.g.
supplier reliability/on-time-delivery scoring, if such data ever becomes available in the
schema) before design begins — not a duplicate of what v1.1 already provides.

### 10.4 Business Dashboard (reserved, BI Platform v2.0)

Not implemented. Per §1/§2, the Dashboard is a **consumer only** — it will call this
document's existing and future `getX()`/`generateX()` functions across every domain and
never perform a calculation itself. Likely the first real consumer of a `BusinessSnapshot`
(§6) combined-read model, which does not exist yet either.
