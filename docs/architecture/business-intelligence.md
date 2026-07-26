# Business Intelligence Platform — Architecture Reference

This is the permanent architectural reference for `js/services/businessIntelligence/`,
written for whoever maintains or extends this module next. It describes the system **as
it stands today**, organized by concept, not by milestone. It does not repeat the
rationale already recorded in the milestone docs — consult those when you need the "why"
behind a specific decision. Sections 1–19 below describe the Inventory Intelligence side
of this platform (Milestone 12A) exactly as that milestone left them — **frozen,
unmodified by Milestone 12B**. Section 20 covers Purchase Intelligence (12B), the second
domain built on the same, shared platform foundation §§2–3 already established.

- `docs/milestones/milestone-12a-inventory-intelligence.md` / `docs/reports/milestone-12a-completion.md` — Inventory Intelligence (12A)
- `docs/milestones/milestone-12b-purchase-intelligence.md` / `docs/reports/milestone-12b-completion.md` — Purchase Intelligence (12B)

## 1. What this platform is

The Inventory Intelligence Platform is ApnaBill's **read-only Business Intelligence
layer** over the existing, already-complete Inventory/Items/Purchases/Sales modules. It
converts inventory data the ERP already stores into reusable insights — inventory value,
turnover, low/out-of-stock, dead/slow/fast-moving classification, category performance,
reorder recommendations. It is **not**:

- a new inventory module — Inventory, Items, Purchases, and Sales already exist and are
  untouched by this platform (confirmed by grep: no file under `js/items.js`,
  `js/purchases.js`, `js/sales.js`, or `schema.sql` was modified for this milestone);
- artificial intelligence, machine learning, or any predictive/statistical model —
  every number here is a deterministic calculation over data that already exists;
- a workflow engine — it never creates a purchase order, never adjusts stock, and never
  automates purchasing. Every recommendation is a suggestion a human (or a future
  Purchase Intelligence milestone) decides what to do with.

It lives entirely under `js/services/businessIntelligence/`, is a sibling of
`js/services/events/`, `js/services/diagnostics/`, `js/services/jobs/`,
`js/services/audit/`, and `js/services/extensions/`, and depends on the public barrels of
all five of those (the same shape `js/services/extensions/` already established as "the
one platform that depends on all the others; none of them import anything back from it").

## 2. The layering — exactly the brief's own diagram

```
ERP (items, batches, stock_ledger, invoice_lines -- read only)
  ↓
Metrics            (metrics/itemMetrics.js)
  ↓
Calculators        (calculators/*.js)
  ↓
Aggregators        (aggregators/*.js)
  ↓
Insight Models     (models/insightModels.js)
  ↓
Business Intelligence Services   (api/inventoryIntelligenceApi.js)
  ↓
Dashboard / Reports / Extensions   (not built by this milestone)
```

A future Dashboard/Report/Extension imports **only** from
`js/services/businessIntelligence/index.js` (or, most commonly, calls a method on the
shared `inventoryIntelligence` instance it exports) — it never reaches into
`calculators/`, `aggregators/`, or `metrics/` directly, and it never performs a
calculation itself. This is the platform's own permanent rule, mirrored from the milestone
brief: **the Dashboard must never contain calculations.**

## 3. Module map and dependency direction

```
shared/                    <- no internal deps (self-contained; deliberately not
  freezeDeep.js, now.js,       imported from events/shared/, diagnostics/shared/,
  config.js                   jobs/shared/, or audit/shared/ -- same precedent
                                every prior platform's own copy already documents).
                                config.js is the single source of truth for every
                                tunable numeric constant this platform has (§18).
  ↑
inventory/                  <- js/supabaseClient.js (supa, getActiveCompanyId) --
  inventoryDataLoader.js        the ONLY file in this platform that touches Supabase
  ↑
metrics/                    <- calculators/ (invoked once per item, per calculator)
  itemMetrics.js
  ↑
calculators/                <- no internal deps besides each other where noted
  inventoryValueCalculator.js
  stockAgeCalculator.js
  turnoverCalculator.js
  movementCalculator.js
  categoryCalculator.js
  ↑
aggregators/                <- calculators/ (movement predicates only -- never
  lowStockAggregator.js         re-derives a predicate, always imports it)
  outOfStockAggregator.js
  deadStockAggregator.js
  slowMovingAggregator.js
  fastMovingAggregator.js
  overstockAggregator.js
  inventorySummaryAggregator.js
  categorySummaryAggregator.js
  reorderSummaryAggregator.js   <- recommendations/reorderRecommendations.js
  ↑
recommendations/            <- calculators/movementCalculator.js
  reorderRecommendations.js
  ↑
models/                     <- shared/freezeDeep.js only (assembles, never calculates)
  insightModels.js
  ↑
diagnostics/                <- diagnostics/ (createStructuredLogger/
  biDiagnostics.js               createExecutionTimeline/createMetricsRecorder)
cache/                      <- no internal deps
  insightCache.js
audit/                      <- events/ (eventBus, EVENT_TYPES) -- the only file in
  biAuditReporter.js            this platform that publishes a Domain Event
extensions/                 <- no internal deps (discovery helpers only)
  capabilityNames.js
  ↑
api/                        <- inventory/, metrics/, calculators/ (via metrics),
  inventoryIntelligenceApi.js    aggregators/, recommendations/ (via aggregators),
                                 models/, diagnostics/, cache/, audit/ -- the
                                 composition root; the ONLY file that wires
                                 everything else together
  ↑
jobs/                       <- events/ (EVENT_TYPES), jobs/registry+contracts
  refreshInventoryInsightsJob.js  (direct subfolder imports, NOT jobs/index.js --
                                    see that file's own header comment for why),
                                    cache/, api/
  ↑
index.js                    <- re-exports everything above
```

Every arrow points from a more specific layer to a more generic one below it, the same
convention every prior platform's own architecture reference documents.

## 4. Public API (`js/services/businessIntelligence/index.js`)

```js
import { inventoryIntelligence, createInventoryIntelligenceApi } from '<path>/services/businessIntelligence/index.js';
```

| Export | Kind | Purpose |
|---|---|---|
| `inventoryIntelligence` | instance | The one shared, application-wide API, wired to the real Supabase-backed loader, shared cache, and shared diagnostics. Real callers use this. |
| `createInventoryIntelligenceApi({ loadSnapshot?, cache?, diagnostics?, recordAudit?, resolveActiveCompanyId? })` | factory | An isolated instance — for tests, or a deliberately separate instance. Every dependency is injectable, which is how this platform's own test suite exercises the whole composition root with zero real Supabase calls. |

### `inventoryIntelligence`'s methods

```js
await inventoryIntelligence.getInventorySummary(opts);          // -> full InventoryInsight model (§7)
await inventoryIntelligence.getInventoryValue(opts);             // -> InventoryValue model
await inventoryIntelligence.getLowStockItems(opts);              // -> item metric[]
await inventoryIntelligence.getOutOfStockItems(opts);            // -> item metric[]
await inventoryIntelligence.getDeadStock(opts);                  // -> item metric[]
await inventoryIntelligence.getSlowMovingItems(opts);            // -> item metric[]
await inventoryIntelligence.getFastMovingItems(opts);            // -> item metric[]
await inventoryIntelligence.getOverstockItems(opts);             // -> item metric[]
await inventoryIntelligence.getCategoryPerformance(opts);        // -> category summary row[]
await inventoryIntelligence.getInventoryTurnover(opts);          // -> number|null (company-wide, annualized)
await inventoryIntelligence.getReorderRecommendations(opts);     // -> { recommendations, urgentCount, ... }
await inventoryIntelligence.generateInventoryInsightReport(opts); // -> InventoryInsight model, AND records an audit entry (§9)
```

`opts` is always `{ companyId?, lookbackDays?, activeOnly?, useCache?, ...movement
threshold overrides }` — every field optional. `companyId` defaults to
`getActiveCompanyId()`; `lookbackDays` defaults to 365; `useCache` defaults to `true`.

## 5. One inventory scan, many insights — performance flow

`inventory/inventoryDataLoader.js`'s `loadInventorySnapshot()` is the **only** place this
platform queries Supabase. It runs exactly four company-scoped queries — `items`,
`batches`, `stock_ledger` (bounded to `lookbackDays`), `invoice_lines` — no matter how
many of the getX() functions above are called, and a fifth, narrowly-scoped query only
for items that are stock-tracked but not batch-tracked (§6). `api/inventoryIntelligenceApi.js`
caches the resulting per-item metrics (`metrics/itemMetrics.js`'s `computeItemMetrics()`
output) for `DEFAULT_CACHE_TTL_MS` (5 minutes, `shared/config.js`, §18) per
`{companyId, lookbackDays, activeOnly}` combination (`cache/insightCache.js`) — every
aggregator called within that window reads the same in-memory array; none of them
re-query the database or rescan raw rows itself.

Exactly what is scanned, and exactly how many times, per call:

```mermaid
flowchart TD
    subgraph DB["Supabase (per company)"]
        Q1["items\n(1 query)"]
        Q2["batches\n(1 query)"]
        Q3["stock_ledger\nbounded to lookbackDays\n(1 query)"]
        Q4["invoice_lines\nlifetime, no date bound\n(1 query)"]
        Q5["stock_ledger, unbounded\nONLY for non-batch-tracked\nitem ids (1 query, conditional)"]
    end

    Q1 & Q2 & Q3 & Q4 & Q5 --> SNAP["InventorySnapshot\n(plain object, grouped by item\nvia Map, in inventoryDataLoader.js)"]

    SNAP --> METRICS["computeItemMetrics()\nONE pass over every item;\ncalls each calculator ONCE per item"]

    METRICS --> CACHE{{"insightCache\nkey = companyId::itemMetrics:lookbackDays:activeOnly"}}
    CACHE -->|cache MISS: store result| ARRAY["itemMetrics[]\n(shared, in-memory, reused)"]
    CACHE -->|cache HIT: skip DB + skip computeItemMetrics| ARRAY

    ARRAY --> A1[aggregateLowStock]
    ARRAY --> A2[aggregateOutOfStock]
    ARRAY --> A3[aggregateDeadStock]
    ARRAY --> A4[aggregateSlowMoving]
    ARRAY --> A5[aggregateFastMoving]
    ARRAY --> A6[aggregateOverstock]
    ARRAY --> A7[aggregateCategorySummary]
    ARRAY --> A8[aggregateReorderSummary]
    ARRAY --> A9["aggregateInventorySummary\n(reads A1-A6's own outputs directly,\nnever re-filters itemMetrics itself)"]

    A1 & A2 & A3 & A4 & A5 & A6 & A7 & A8 & A9 --> MODEL["buildInventoryInsightModel()\n(assembly only, no calculation)"]
```

**The reuse guarantee, concretely:** calling `getInventorySummary()`,
`getLowStockItems()`, `getDeadStock()`, `getCategoryPerformance()`, and
`getReorderRecommendations()` back-to-back for the same company performs the Supabase
scan and `computeItemMetrics()` pass **once**, not five times — the second through fifth
calls hit `insightCache` and reuse the same `itemMetrics[]` array. This is exercised
directly by `businessIntelligence.test.html`'s api-layer block ("second call with
identical opts is served from cache — loader not re-invoked").

`aggregateInventorySummary()` (§ above) is itself a second-order reuse example: it does
not re-filter `itemMetrics` — it calls the six single-purpose aggregators
(`aggregateLowStock`, `aggregateOutOfStock`, `aggregateDeadStock`, `aggregateSlowMoving`,
`aggregateFastMoving`, `aggregateOverstock`) and only counts their results, so the
movement predicates in `calculators/movementCalculator.js` are evaluated exactly once per
item per aggregator, never duplicated between a specific `getX()` call and the summary.

## 6. Known, disclosed data-model limitations

The database schema is frozen — this milestone reads it as-is, and where the schema
doesn't cleanly support a requested metric, the limitation is disclosed here rather than
worked around with a schema change:

- **No "category" column exists on `items`.** `calculators/categoryCalculator.js` uses
  `hsn_sac` (the GST tax-classification code every item already carries) as a category
  proxy — items sharing an HSN/SAC code are, in Indian retail practice, the same class of
  goods. Items with a blank/null `hsn_sac` group under `"Uncategorized"`.
- **No reservation/sales-order concept exists.** `reservedStock` is always `0` and
  `availableStock` always equals `currentStock` — there is no table anywhere that holds a
  "committed but not yet shipped" quantity.
- **Non-batch-tracked items** (`items.track_batches = false`) never get a `batches` row —
  `batches.qty_on_hand` (the authoritative running balance for batch-tracked items) does
  not exist for them. `inventory/inventoryDataLoader.js` runs one additional, narrowly-scoped,
  unbounded `stock_ledger` query — filtered to only those item ids — to compute their
  current stock instead (still "one query", not one per item).
- **`stock_ledger`'s `unit_cost` on a `'sale'` row is `null` for non-batch-tracked
  items** (confirmed by reading `sale_rpc.sql`'s own non-batch branch) — COGS, and
  therefore turnover ratio, cannot be computed for these items from this data alone; a
  `null` contributes `0` to COGS rather than being estimated. This understates turnover
  for non-batch-tracked items specifically — a real, disclosed limitation of the source
  data, not a calculation bug.
- **`stock_ledger` is read within a `lookbackDays` window** (default
  `DEFAULT_LOOKBACK_DAYS` = 365, `shared/config.js`, §18), not unbounded — an item with
  zero ledger activity inside that window still correctly
  reports `daysSinceLastSale: null` (which IS the dead-stock signal), it just cannot
  report an exact "last sold 400 days ago" date beyond the window.
- **Average Selling Price is a lifetime average**, not windowed — `invoice_lines` carries
  no date column of its own, and this milestone does not join it against `invoices` to
  keep the loader at "one query per table."
- **Average Cost is the current stock's cost basis** (qty-weighted `batches.cost_price`),
  not a historical average purchase price — that would require scanning `purchase_lines`'
  own dated history, out of scope for this metric.

## 7. Insight Models

`models/insightModels.js` assembles already-computed pieces into one deep-frozen object
— it performs no calculation itself. The full model, from `getInventorySummary()` /
`generateInventoryInsightReport()`:

```
companyId, generatedAt, lookbackDays,
inventoryValue: { totalInventoryValue, avgInventoryValuePerItem, trackedItemCount, totalStockQty },
stockTurnover:  { overallTurnoverRatio, totalCogsInWindow, lookbackDays },
summary,              -- aggregators/inventorySummaryAggregator.js's full output
lowStock, outOfStock, deadStock, slowMoving, fastMoving, overstock,  -- item metric arrays
categoryPerformance,  -- aggregators/categorySummaryAggregator.js's rows
recommendations       -- aggregators/reorderSummaryAggregator.js's output
```

## 8. Movement classification — one decision point, not duplicated per aggregator

`calculators/movementCalculator.js` is the single source of truth for
Low/Out-of-Stock/Dead/Slow/Fast/Overstock predicates (`isLowStock`, `isOutOfStock`,
`isDeadStock`, `isSlowMoving`, `isFastMoving`, `isOverstock`) — every aggregator imports
these, none re-derive the logic. Dead stock takes precedence: an item with no recent sale
is never also counted as slow-moving or overstocked, even though its turnover ratio and
days-of-cover would otherwise qualify — a dead item is a more severe signal than a merely
slow one. All thresholds (`MOVEMENT_DEFAULTS`) are overridable per call, never hardcoded
into an aggregator.

## 9. Diagnostics, caching, and audit — reused, not rebuilt

- **Diagnostics** (`diagnostics/biDiagnostics.js`): fresh instances of
  `diagnostics/`'s own `createStructuredLogger`/`createExecutionTimeline`/
  `createMetricsRecorder` factories — the same reuse pattern the Job Engine (11D) and
  Audit Platform (11E) already established. This platform never subscribes to the Event
  Bus and never starts the shared `diagnosticsObserver` — it is called directly, not
  triggered by events. Every calculation records execution time, items analyzed, and any
  warnings via one `timeline.time()`-style wrapper; cache hits/misses are logged and
  counted separately.
- **Caching** (`cache/insightCache.js`): a plain, in-memory, per-`{companyId, cacheKey}`
  TTL cache — not a new scheduler, just the store a scheduled job (§10) keeps warm. Full
  scope/invalidation/ownership/lifecycle design: §15.
- **Audit** (`audit/biAuditReporter.js`): this platform is read-only and does **not**
  audit every query — only `generateInventoryInsightReport()` (covering an on-demand
  report, a dashboard export, or the scheduled job in §10, distinguished by its
  `reportType` argument) calls `recordInventoryInsightGenerated()`, which publishes a real
  Domain Event (`EVENT_TYPES.INVENTORY_INSIGHT_GENERATED`, added to
  `events/registry/eventTypes.js` via that file's own documented "add one entry" extension
  mechanism, and to `audit/registry/auditRegistry.js` the same way) and lets the
  already-existing Audit Platform observe it like any other event. This file never writes
  an audit record itself and never starts `auditSubscriber`.

## 10. Background Jobs — reused, not rebuilt

`jobs/refreshInventoryInsightsJob.js` registers **one** job
(`JOB_IDS.REFRESH_INVENTORY_INSIGHTS`, added to `jobs/registry/jobIds.js`) with the
existing Job Engine, via `jobs/bootstrap/startBackgroundInfrastructure.js`'s own
documented extension point. Triggered by `StockAdjusted`, `PurchaseCreated`,
`SaleCreated`, and `ItemCreated` — the four events that can change what an inventory
insight would say. On trigger: invalidates the affected company's cached summary
(`insightCache.invalidateCompany`), recomputes and re-caches it via
`generateInventoryInsightReport({ reportType: 'scheduled' })` (which also records the
audit entry per §9). No new scheduler was built — this is the exact "if expensive
calculations exist, cache them using scheduled jobs... do NOT create another scheduler"
instruction this milestone was given.

## 11. Extension points

`extensions/capabilityNames.js` names three capability strings a future extension may
declare in its own `createExtensionDefinition({ capabilities: [...] })`, plus read-only
discovery helpers over the existing Capability Registry (11F) — the same "dumb,
discovery-only" pattern that registry already documents:

```
BI_CAPABILITIES.INVENTORY_INSIGHT_PROVIDER  -- contributes additional inventory insights/facts
BI_CAPABILITIES.INVENTORY_METRIC_PROVIDER   -- contributes an additional per-item metric
BI_CAPABILITIES.DASHBOARD_CARD_PROVIDER     -- contributes a renderable card for a future Dashboard
```

`getInventoryInsightProviders(extensionRuntime)` /
`getInventoryMetricProviders(extensionRuntime)` /
`getDashboardCardProviders(extensionRuntime)` each wrap
`extensionRuntime.capabilityRegistry.getProviders(name)`, returning `[]` (never throwing)
when no runtime is supplied. This module does not modify
`js/services/extensions/` itself. How a future extension actually participates: declare
the capability, subscribe to whatever Domain Events it needs via its own
`ExtensionContext`, and expose its own well-known function a future Dashboard looks up by
extension id after calling one of the discovery helpers above — the same "a consumer
decides what to do with however many providers exist" model the Capability Registry
already uses for every other capability name.

## 12. Error handling

Every layer is a pure function except `inventory/inventoryDataLoader.js` (I/O) and
`jobs/refreshInventoryInsightsJob.js` (runs inside the Job Engine's own
`executeJob()`, which never rethrows — see `docs/job-engine-architecture.md` §9). A
calculator/aggregator/model given well-formed input never throws; `api/inventoryIntelligenceApi.js`
throws only for a genuine caller error (no active company resolvable). Nothing in this
platform ever calls `eventBus.publish()` for a business-mutating fact, only for the one
disclosed audit event in §9.

## 13. Current call sites

Registered, but not yet consumed anywhere in the real UI — this milestone builds the
Business Intelligence *services* layer only, explicitly not a Dashboard (per the
milestone brief: "Do NOT build Dashboard UI"). `jobs/refreshInventoryInsightsJob.js` **is**
live (registered in `startBackgroundInfrastructure()`, which every real page's own
`boot()` already calls per 11D) — it silently keeps the cache warm; nothing in the UI
reads its output yet.

## 14. How to extend this platform

**Add a new metric**: add it to `metrics/itemMetrics.js`'s returned object, backed by a
new or existing calculator. Every aggregator that iterates `itemMetrics` picks it up for
free if it reads the field; nothing about `inventory/inventoryDataLoader.js` needs to
change unless the metric needs a column not already loaded.

**Add a new aggregator**: add a new file under `aggregators/`, importing only from
`calculators/` (never re-deriving a predicate), and wire it into
`api/inventoryIntelligenceApi.js` as a new `getX()` function plus re-export it from
`index.js`.

**Add a new capability an extension can provide**: add a new key to
`extensions/capabilityNames.js`'s `BI_CAPABILITIES` and a matching discovery helper —
nothing under `js/services/extensions/` itself needs to change.

**Milestone 12B (Purchase Intelligence) and beyond**: not started by this milestone. See
§19 below and `docs/reports/milestone-12a-completion.md` §"Readiness for Milestone 12B"
for what is already reusable (the diagnostics/cache/audit/extension wiring patterns, the
`createXApi({ loadSnapshot, cache, diagnostics, recordAudit })` dependency-injection
shape) and what a Purchase Intelligence milestone would need to build fresh (its own data
loader over `purchases`/`purchase_lines`, its own metrics/calculators/aggregators).

## 15. Cache design — scope, invalidation, ownership, lifecycle

`cache/insightCache.js`'s `createInsightCache({ ttlMs })` is a small, dependency-free,
in-memory memoization store. Four properties fully describe it:

**Scope.** One cache instance holds entries for **every** company the running page
touches, but each entry is keyed by `${companyId}::${cacheKey}` — never just `cacheKey`.
`cacheKey` itself is built by the API layer as `` `itemMetrics:${lookbackDays}:${activeOnly}` ``,
so two calls for the same company with different `lookbackDays` or `activeOnly` never
collide or share a stale entry. What is cached is exactly one thing: the
`{ companyId, generatedAt, lookbackDays, itemMetrics }` result of
`getItemMetricsSnapshot()` (the "one scan" step, §5) — never a fully-built
`InventoryInsightModel`, and never a raw Supabase response. Every `getX()` re-derives its
own aggregation from the cached `itemMetrics[]` on every call; only the expensive
scan-and-compute step is memoized.

**Invalidation.** Two independent mechanisms, never a third:
1. **Time-based (TTL)**: `get()` checks `Date.now() > entry.expiresAt` lazily, on read —
   there is no background timer sweeping the store. An expired entry is deleted the next
   time it's looked up and treated identically to a cache miss.
2. **Event-driven (explicit)**: `jobs/refreshInventoryInsightsJob.js` calls
   `insightCache.invalidateCompany(companyId)` whenever `StockAdjusted`, `PurchaseCreated`,
   `SaleCreated`, or `ItemCreated` fires for that company (§10) — deleting every entry
   whose key starts with `${companyId}::`, regardless of `cacheKey` suffix (so all
   `lookbackDays`/`activeOnly` variants for that company are invalidated together, not
   just the one combination the job happens to recompute next). `useCache: false` on any
   `getX()` call is a third, per-call bypass (skip read AND skip write) — not an
   invalidation, since it never deletes an existing entry.

**Memory ownership.** The cache owns exactly one JS `Map` in its own closure — no
external code ever holds a reference to an entry directly; every read goes through `get()`,
every write through `set()`. `api/inventoryIntelligenceApi.js` does not own the cache; it
receives one via dependency injection (`createInventoryIntelligenceApi({ cache })`,
defaulting to the shared `insightCache` singleton) and never reaches into its internal
`Map`. Nothing in this platform ever caches a DOM node, a Supabase client, or any
UI-owned object — cached values are always plain, JSON-serializable data
(`{ companyId, generatedAt, lookbackDays, itemMetrics }`), safe to hold indefinitely
without leaking a reference to something the ERP owns.

**Lifecycle.** The shared `insightCache` (exported from `cache/insightCache.js`, and from
`index.js`) is constructed once, at module load, as a singleton — the same shape every
other shared instance in this codebase uses (`eventBus`, `jobDispatcher`,
`auditSubscriber`, `extensionRuntime`). Because this is a multi-page application (no SPA
router, no persistent process), the cache's actual lifetime is **one page load**: a full
navigation re-imports the module graph and constructs a fresh, empty `insightCache` —
identical to how the Job Engine's `runHistory` and the Audit Platform's in-memory store
are already documented to reset on navigation (`docs/releases/platform-v2-foundation.md`).
There is no `clear()` call anywhere in production code; `clear()` exists (§ below) purely
for test isolation. A test, or any future caller that wants full control, constructs its
own isolated instance via `createInsightCache({ ttlMs })` instead of touching the shared
singleton — exactly the pattern `businessIntelligence.test.html`'s api-layer and
cache-specific test blocks both use.

## 16. Dependency graph and cycle verification

Every import edge under `js/services/businessIntelligence/`, plus its five external
touchpoints (`events/`, `diagnostics/`, `jobs/`, `audit/`, `extensions/`) and the one
reverse edge from `jobs/bootstrap/startBackgroundInfrastructure.js`, verified
programmatically (not just by inspection) with a small script that parses every
`import`/`export ... from` statement across all 84 files in that combined scope, resolves
relative specifiers to real files, builds the graph, and runs DFS cycle detection:

```
Scanned 84 files, 180 internal edges.
NO CYCLES DETECTED.
```

The graph is a strict DAG with this layering (each row may depend only on rows below it,
plus external platform barrels):

```mermaid
flowchart TD
    IDX["index.js"] --> API
    JOBFILE["jobs/refreshInventoryInsightsJob.js"] --> API["api/inventoryIntelligenceApi.js"]
    IDX --> JOBFILE
    API --> AGG9["aggregators/inventorySummaryAggregator.js\naggregators/reorderSummaryAggregator.js\naggregators/categorySummaryAggregator.js"]
    API --> LOADER["inventory/inventoryDataLoader.js"]
    API --> METRICS["metrics/itemMetrics.js"]
    API --> MODELS["models/insightModels.js"]
    API --> DIAG["diagnostics/biDiagnostics.js"]
    API --> CACHE["cache/insightCache.js"]
    API --> AUDIT["audit/biAuditReporter.js"]
    AGG9 --> AGGSIMPLE["aggregators/lowStock, outOfStock, deadStock,\nslowMoving, fastMoving, overstock"]
    AGG9 --> RECS["recommendations/reorderRecommendations.js"]
    AGGSIMPLE --> CALC["calculators/movementCalculator.js"]
    RECS --> CALC
    METRICS --> CALC2["calculators/inventoryValueCalculator.js,\nstockAgeCalculator.js, turnoverCalculator.js,\ncategoryCalculator.js"]
    MODELS --> SHARED["shared/freezeDeep.js"]
    CALC & CALC2 --> CONFIG["shared/config.js"]
    LOADER --> CONFIG
    API --> CONFIG
    CACHE --> CONFIG
    LOADER --> EXT1["js/supabaseClient.js"]
    API --> EXT1
    DIAG --> EXT2["diagnostics/index.js"]
    AUDIT --> EXT3["events/index.js"]
    JOBFILE --> EXT3
    JOBFILE --> EXT4["jobs/registry/jobIds.js\njobs/contracts/jobContract.js"]

    BOOT["jobs/bootstrap/startBackgroundInfrastructure.js\n(EXTERNAL to this platform)"] --> JOBFILE
```

**Why the `jobs/bootstrap → businessIntelligence/jobs` edge is not a cycle**: it would
only become one if `refreshInventoryInsightsJob.js` imported back from `jobs/index.js`
(which re-exports `bootstrap/startBackgroundInfrastructure.js`) — it deliberately does
not; it imports `jobs/registry/jobIds.js` and `jobs/contracts/jobContract.js` directly
(the same precedent `jobs/jobs/refreshMetricsJob.js` and its siblings already establish
for the identical reason). This is the one place in the whole graph where getting the
import path wrong would have introduced a real cycle, and it's called out explicitly in
both this file and the source file's own header comment.

**No platform this one depends on imports anything back from it** — confirmed by the same
scan: zero edges originate in `events/`, `diagnostics/`, `jobs/` (other than the one
bootstrap registration line above, which is a call site, not an import of BI *logic*
back into a lower layer — `jobs/dispatcher/`, `jobs/registry/`, `jobs/lifecycle/`,
`jobs/contracts/` remain untouched), `audit/`, or `extensions/` pointing into
`businessIntelligence/`.

## 17. Module boundary verification — BI ↔ UI ↔ ERP

Two independent, disclosed constraints, both verified by grep across the entire
repository, not assumed:

**No BI module imports UI code.** Searching every `.js` file under
`js/services/businessIntelligence/` for `js/ui`, `document.`, `window.`, `innerHTML`,
`querySelector`, and `addEventListener` returns exactly zero real matches in production
code — the only two textual hits (`calculators/turnoverCalculator.js`,
`inventory/inventoryDataLoader.js`) are the English word "window" inside a comment
("lookback window", "beyond the window"), not the global `window` object, confirmed by
reading the matched lines directly. The one file that *does* use `document.` is
`businessIntelligence.test.html` itself — a test harness rendering PASS/FAIL output, the
same pattern every other platform's own `.test.html` uses, and not part of the module
graph any production code imports.

**No ERP or UI module imports BI code.** Searching the entire repository (every `.js` and
`.html` file) for the string `businessIntelligence` returns exactly ten files: eight are
inside `js/services/businessIntelligence/` itself (matching their own path in header
comments or barrel re-exports — expected), one is `js/services/jobs/jobEngine.test.html`
(a code *comment* explaining why its own job count changed from 3 to 4, not an import),
and one is the single, sanctioned, already-documented edge:
`js/services/jobs/bootstrap/startBackgroundInfrastructure.js` registering
`refreshInventoryInsightsJob` (§16). None of `js/items.js`, `js/purchases.js`,
`js/sales.js`, `js/suppliers.js`, `js/manufacturing.js`, `js/searchService.js`,
`js/gst.js`, `js/supabaseClient.js`, nor any `.html` page (`items.html`, `sale.html`,
`purchase.html`, `stock.html`, `manufacturing.html`, `suppliers.html`, `menu.html`,
`index.html`) reference this platform at all.

## 18. Configuration — no magic numbers

`shared/config.js` is the single source of truth for every tunable numeric constant this
platform uses. No calculator, aggregator, loader, or cache file defines its own literal
copy of any of these — each imports its value from here:

| Constant | Value | Used by |
|---|---|---|
| `MS_PER_DAY` | `86400000` | `calculators/stockAgeCalculator.js`, `metrics/itemMetrics.js` (batch age, days-since-last-sale/purchase) |
| `DAYS_PER_YEAR` | `365` | `calculators/turnoverCalculator.js` (annualizing a turnover ratio computed over an arbitrary `lookbackDays`) |
| `DEFAULT_LOOKBACK_DAYS` | `365` | `inventory/inventoryDataLoader.js`, `api/inventoryIntelligenceApi.js` (default `stock_ledger` scan window) |
| `DEFAULT_CACHE_TTL_MS` | `300000` (5 min) | `cache/insightCache.js` (default entry lifetime) |
| `MOVEMENT_DEFAULTS.deadStockDays` | `180` | `calculators/movementCalculator.js` (`isDeadStock`) |
| `MOVEMENT_DEFAULTS.slowMovingMaxTurnsPerYear` | `2` | `calculators/movementCalculator.js` (`isSlowMoving`) |
| `MOVEMENT_DEFAULTS.fastMovingMinTurnsPerYear` | `12` | `calculators/movementCalculator.js` (`isFastMoving`) |
| `MOVEMENT_DEFAULTS.overstockDaysOfCover` | `90` | `calculators/movementCalculator.js` (`isOverstock`) |
| `REORDER_DEFAULTS.leadTimeDays` | `7` | `recommendations/reorderRecommendations.js` |
| `REORDER_DEFAULTS.safetyStockDays` | `7` | `recommendations/reorderRecommendations.js` |
| `REORDER_DEFAULTS.noVelocityRestockMultiplier` | `2` | `recommendations/reorderRecommendations.js` (fallback target-stock heuristic when an item has zero observed sales velocity) |

`MOVEMENT_DEFAULTS` and `REORDER_DEFAULTS` are still re-exported from their historical,
documented homes (`calculators/movementCalculator.js` and
`recommendations/reorderRecommendations.js` respectively) so no existing import path or
public API surface changed when their values were consolidated here — only where the
values themselves live changed. Every one of these ten constants is overridable per call
(`opts` on any `getX()`, or a constructor argument on `createInsightCache`) — nothing here
is a value a caller is stuck with.

Deliberately **not** treated as a "magic number" needing extraction: comparisons against
`0` (e.g. `currentStock <= 0`, `totalQty > 0`) are mathematical identity/sign checks, not
tunable business thresholds — extracting `0` into a config constant would add
indirection without adding configurability.

## 19. Milestone 12B (Purchase Intelligence) — reuse, as actually built

This section originally predicted, before 12B existed, that it could be built by reusing
this pipeline with zero architectural changes. **Confirmed, and now built** — see §20 for
the full reference. What actually happened, against each original prediction:

1. `purchase/purchaseDataLoader.js` was added exactly as predicted — the only file under
   `purchase/` that touches Supabase, querying `purchases`/`purchase_lines`/`parties`.
   One deviation from the original guess: `purchase_lines` carries no date of its own, so
   this loader also attaches each line's own purchase's `billDate`/`supplierId` via an
   in-memory `Map` lookup (zero extra queries) — necessary because, unlike 12A's
   lifetime-only average selling price, Purchase Intelligence's brief explicitly required
   dated price history and trend.
2. `metrics/purchaseMetrics.js` and `metrics/supplierMetrics.js` were added, reusing
   `calculators/categoryCalculator.js`'s `resolveCategory`/`groupMetricsByCategory` and
   `calculators/turnoverCalculator.js`'s `calculateDailySalesVelocity` **exactly as
   predicted, unmodified**.
3. Nine new aggregators, one new recommendations file, and one new models file were
   added — confirmed, same layering rule.
4. `api/purchaseIntelligenceApi.js` uses the **exact same**
   `createXApi({ loadSnapshot, cache, diagnostics, recordAudit, resolveActiveCompanyId })`
   shape, confirmed.
5. **Deviated from the original prediction, deliberately.** Rather than a separate cache
   instance via `createInsightCache()`, Purchase Intelligence reuses the SAME shared
   `insightCache` singleton `api/inventoryIntelligenceApi.js` already uses — collision-free
   because every Purchase Intelligence cache key is prefixed `purchaseMetrics:...`,
   distinct from Inventory's own `itemMetrics:...` prefix. This is a closer, more literal
   reading of the 12B brief's own "Reuse the existing cache implementation... do NOT
   create another cache" than the original prediction assumed — one cache, two domains,
   for the whole Business Intelligence platform. Same reasoning applied to diagnostics:
   the SAME shared `biDiagnostics` singleton is reused by default, not a second instance.
6. One new event type (`PurchaseInsightGenerated`), one new audit registry entry, and one
   new job id + registration line were added — exactly as predicted, using the same three
   extension points §16 already exercised for 12A.

**This paragraph's original prediction (a separate sibling module) turned out wrong, and
is corrected here rather than silently deleted.** The actual 12B brief was explicit and
overrides it: "Extend `js/services/businessIntelligence/`... Reuse the existing folders...
Do NOT introduce a parallel architecture." Purchase Intelligence therefore lives as new
*sibling files within the same folders* (`purchase/`, a new file in `metrics/`, new files
in `calculators/`/`aggregators/`/`recommendations/`/`models/`/`audit/`/`api/`/`jobs/`) —
one platform, two domains, one shared `index.js` barrel, one shared cache and diagnostics
instance (§19 point 5) — not two separate platforms as originally guessed. Every existing
12A file remains byte-for-byte unchanged regardless (confirmed by `git diff` against the
`inventory-intelligence-v1.0` tag, §20). Nothing under `js/services/businessIntelligence/`
that already existed needed to change to support this — only new files were added, plus
the four small, additive registry/barrel edits §20 documents in full.

## 20. Purchase Intelligence (Milestone 12B) — architecture reference

Everything below is specific to the Purchase Intelligence domain, added to this same
platform. Sections 1–19 above (Inventory Intelligence, 12A) remain the authoritative
reference for that domain and were not modified by anything in this section.

### 20.1 What it is

Purchase Intelligence converts purchase (bill) history the ERP already stores into
reusable insights: average/last/highest/lowest purchase price, price history, cost trend
(rising/falling/stable), rolling purchase average, purchase frequency, supplier
comparison and ranking, preferred supplier, category purchase totals, and purchase
recommendations (advisory only — never creates a purchase order, never updates a
supplier record, never automates purchasing). It is **not** a purchasing module —
Purchasing (`js/purchases.js`) and Supplier Management (`js/suppliers.js`) already exist,
untouched by this milestone (confirmed by `git diff` against `inventory-intelligence-v1.0`
returning nothing for either file, or for `schema.sql`).

### 20.2 Module map addition

```
purchase/                   <- js/supabaseClient.js -- the ONLY file in this domain
  purchaseDataLoader.js         that touches Supabase
  ↑
metrics/
  purchaseMetrics.js         <- calculators/averagePriceCalculator.js,
                                 purchaseTrendCalculator.js, purchaseFrequencyCalculator.js,
                                 categoryCalculator.js (12A, frozen, reused as-is)
  supplierMetrics.js         <- calculators/supplierSpendCalculator.js,
                                 purchaseFrequencyCalculator.js
  ↑
calculators/                <- no internal deps besides each other where noted; all new
  averagePriceCalculator.js
  purchaseTrendCalculator.js     <- averagePriceCalculator.js
  purchaseFrequencyCalculator.js <- turnoverCalculator.js (12A, frozen -- calculateDailySalesVelocity reused, not copied)
  supplierSpendCalculator.js
  ↑
aggregators/                <- calculators/ + each other where noted; all new
  supplierComparisonAggregator.js    <- averagePriceCalculator.js (reads the raw PurchaseSnapshot directly -- see 20.4)
  preferredSupplierAggregator.js     <- supplierComparisonAggregator.js
  costHistoryAggregator.js           (reads the raw PurchaseSnapshot directly)
  supplierRankingAggregator.js
  purchaseTrendSummaryAggregator.js  <- purchaseTrendCalculator.js (COST_TREND)
  purchaseFrequencySummaryAggregator.js
  categoryPurchaseSummaryAggregator.js <- categoryCalculator.js (12A, frozen)
  topPurchasedItemsAggregator.js
  purchaseSummaryAggregator.js       <- purchaseTrendSummaryAggregator.js, purchaseFrequencySummaryAggregator.js
  ↑
recommendations/
  purchaseRecommendations.js  <- purchaseTrendCalculator.js (COST_TREND) + shared/config.js only
                                 -- deliberately NOT aggregators/ (same "recommendations
                                 import only from calculators/" layering
                                 reorderRecommendations.js already established); the caller
                                 (api/purchaseIntelligenceApi.js) is responsible for
                                 computing per-item supplier comparisons via the aggregator
                                 and passing them in
  ↑
models/
  purchaseInsightModels.js    <- shared/freezeDeep.js only
  ↑
diagnostics/                  <- REUSES the shared biDiagnostics singleton (12A); no new file
cache/                         <- REUSES the shared insightCache singleton (12A); no new file
audit/
  purchaseAuditReporter.js    <- events/ (eventBus, EVENT_TYPES) -- publishes PurchaseInsightGenerated
extensions/                   <- REUSES the existing three capability names (12A); no new file
  ↑
api/
  purchaseIntelligenceApi.js  <- purchase/, metrics/, aggregators/, recommendations/,
                                 models/, diagnostics/, cache/, audit/ -- the composition
                                 root for this domain
  ↑
jobs/
  refreshPurchaseInsightsJob.js <- events/ (EVENT_TYPES), jobs/registry+contracts (direct
                                    subfolder imports, not jobs/index.js -- same
                                    circular-import avoidance as 12A's own job), cache/, api/
```

### 20.3 Public API (`js/services/businessIntelligence/index.js`)

```js
import { purchaseIntelligence, createPurchaseIntelligenceApi } from '<path>/services/businessIntelligence/index.js';
```

```js
await purchaseIntelligence.getPurchaseSummary(opts);                    // -> company-wide PurchaseSummary model
await purchaseIntelligence.getAveragePurchasePrice({ itemId, ...opts }); // -> number|null
await purchaseIntelligence.getPurchaseHistory({ itemId, ...opts });      // -> full per-item PurchaseInsight model
await purchaseIntelligence.getCostHistory({ itemId, ...opts });          // -> raw chronological price/qty history only
await purchaseIntelligence.getPurchaseTrends(opts);                      // -> company-wide rising/falling/stable/insufficientData buckets
await purchaseIntelligence.getSupplierComparison({ itemId, ...opts });   // -> per-supplier price comparison for one item, cheapest first
await purchaseIntelligence.getSupplierRanking(opts);                     // -> suppliers ranked by spend/count/avgOrderValue
await purchaseIntelligence.getPreferredSupplier({ itemId, ...opts });    // -> the cheapest supplier for one item, or null
await purchaseIntelligence.getPurchaseFrequency({ itemId?, ...opts });   // -> per-item number if itemId given, else company-wide high/low buckets
await purchaseIntelligence.getTopPurchasedItems(opts);                   // -> topN items by value/qty/count
await purchaseIntelligence.getCategoryPurchases(opts);                   // -> per-category totals, highest spend first
await purchaseIntelligence.getPurchaseRecommendations(opts);             // -> one advisory recommendation per item
await purchaseIntelligence.generatePurchaseInsightReport(opts);          // -> full model, AND records an audit entry
```

`opts` is always `{ companyId?, lookbackDays?, useCache?, ...PURCHASE_DEFAULTS overrides }`.
`createPurchaseIntelligenceApi({ loadSnapshot?, cache?, diagnostics?, recordAudit?,
resolveActiveCompanyId? })` is the isolated/test factory, identical shape to
`createInventoryIntelligenceApi`.

### 20.4 One purchase scan, many insights

`purchase/purchaseDataLoader.js`'s `loadPurchaseSnapshot()` runs exactly three
company-scoped queries (a fourth is skipped entirely if the first returns zero purchases):
`purchases` (bounded to `lookbackDays` via `bill_date`, a real date column — no windowing
workaround needed here, unlike `stock_ledger`), `purchase_lines` (scoped via
`.in('purchase_id', purchaseIds)`, never its own date filter since it has no date column),
and `parties` (suppliers only). Each `purchase_line` is enriched with its own purchase's
`billDate`/`supplierId` via an in-memory `Map` lookup at load time — this is what makes
Price History / Cost Trend / Rolling Purchase Average possible at all, and is the one
place this domain's loader does more work than 12A's own `invoice_lines` reuse (which
deliberately stayed lifetime-only, see §6).

`api/purchaseIntelligenceApi.js` caches the `{ snapshot, purchaseMetrics, supplierMetrics }`
bundle under a `purchaseMetrics:${lookbackDays}` key in the SAME shared `insightCache` — a
second call to any `getX()` for the same company/window reuses that same bundle, no
re-scan, no re-computation. `supplierComparisonAggregator.js`, `preferredSupplierAggregator.js`,
and `costHistoryAggregator.js` read the raw `snapshot` (not just `purchaseMetrics`)
because per-supplier, per-item breakdown is data `metrics/purchaseMetrics.js` deliberately
aggregates away (it sums across all suppliers per item) — this is disclosed explicitly in
each of those three files' own header comments rather than silently deviating from the
"aggregators only consume metrics" shape most of the other aggregators use.

### 20.5 Cost trend classification

`calculators/purchaseTrendCalculator.js`'s `calculateCostTrend()` splits an item's
purchase history at the lookback window's midpoint, compares the qty-weighted average
price of each half (reusing `calculateAvgPurchasePrice()`, never re-deriving it), and
classifies `RISING`/`FALLING`/`STABLE`/`INSUFFICIENT_DATA` (`COST_TREND`) — the last one
returned whenever either half has zero purchases, rather than fabricating a direction
from one-sided data. `recommendations/purchaseRecommendations.js`'s `priceIncreaseWarning`/
`priceDropOpportunity` map directly onto `RISING`/`FALLING`.

### 20.6 Recommendations

`recommendations/purchaseRecommendations.js`'s `buildPurchaseRecommendation()` produces,
per item: `preferredSupplier`, `supplierConsolidationOpportunity` (bought from >=
`PURCHASE_DEFAULTS.minSuppliersForConsolidation` distinct suppliers),
`betterCostOpportunity` (current price paid is >= `betterCostThresholdPct` above the
cheapest known supplier's own average — only ever computed with 2+ suppliers to compare),
`bulkPurchaseOpportunity`/`highFrequencyAlert` (share one trigger deliberately — frequent
small purchases is exactly the signal for both), `lowFrequencyAlert`, and the two
price-trend flags above. Purely advisory, per the milestone's own "Never perform actions"
rule — no field here ever creates a purchase order or modifies a supplier record.

### 20.7 Diagnostics, cache, audit, extensions, jobs — reused, literally

- **Diagnostics**: the same shared `biDiagnostics` singleton 12A uses, by default —
  execution time, items analyzed, suppliers compared, cache hit/miss, warnings, all via
  the same `diagnostics.time()` wrapper.
- **Cache**: the same shared `insightCache` singleton, namespaced by a distinct key
  prefix (§19 point 5) — not a second cache implementation.
- **Audit**: one new, narrow file (`audit/purchaseAuditReporter.js`) publishing one new,
  additive event type (`EVENT_TYPES.PURCHASE_INSIGHT_GENERATED`) — audited only via
  `generatePurchaseInsightReport()`, never on a routine `getX()` read, mirroring
  `biAuditReporter.js`'s own boundary exactly.
- **Extensions**: no new capability names were added. The three existing
  `BI_CAPABILITIES` (`InventoryInsightProvider`, `InventoryMetricProvider`,
  `DashboardCardProvider`) already cover what a future extension needs — a purchase-facing
  extension can declare `DASHBOARD_CARD_PROVIDER` for a purchase-related dashboard card,
  or subscribe to `PurchaseInsightGenerated` directly via its own `ExtensionContext`,
  without a new, purchase-specific capability constant. `extensions/capabilityNames.js`
  was not modified.
- **Jobs**: one new job (`refreshPurchaseInsightsJob`), triggered by `PurchaseCreated`
  and `SupplierCreated`, registered via `startBackgroundInfrastructure()`'s own documented
  extension point. `PurchaseCreated` is also one of `refreshInventoryInsightsJob`'s own
  trigger events — both jobs firing on the same event and both calling
  `insightCache.invalidateCompany(companyId)` on the shared cache is intentional and
  harmless (a purchase changes both inventory levels and purchase-price history for that
  company), not a race condition worth avoiding.

### 20.8 Known, disclosed limitations (Purchase Intelligence-specific)

- **Purchase Intelligence's own metrics/aggregators are scoped to items and suppliers
  actually purchased within the lookback window** — like 12A's own item scan, this is
  purchase-*history* analysis, not a master-data directory (that remains `js/suppliers.js`'s
  own job).
- **`grandTotal`/`lineTotal` are used as-is from `purchases`/`purchase_lines`** (already
  tax-inclusive per the existing schema's own computation in `purchases.js`/`sale_rpc.sql`-
  style RPCs) — this domain does not re-derive taxable value or GST breakdowns.
- **The cost-trend midpoint split is a simple two-half comparison**, not a regression or
  seasonality-aware model — deliberately simple, matching the "deterministic calculation,
  not statistics/ML" spirit of the whole platform.
- **`betterCostOpportunity` compares against the cheapest supplier's own historical
  average**, not a live quote — it can flag a supplier who was cheap in the past but may
  no longer be, since Purchase Intelligence has no real-time pricing feed (none exists in
  this ERP).

### 20.9 Dependency graph update

Re-running the same programmatic cycle-detection method §16 used (parsing every
`import`/`export ... from` across `businessIntelligence/` + its five external
touchpoints): **106 files, 260 edges, zero cycles** — up from 12A's own 84 files/180
edges, the +22 files/+80 edges being exactly this milestone's new purchase-domain files.
The two reverse edges from `jobs/bootstrap/startBackgroundInfrastructure.js` (one per
milestone's own job) remain the only edges pointing INTO `businessIntelligence/` from
outside it — confirmed by the same repository-wide grep method §17 used, extended to the
new `purchase*`-named files: exactly ten hits total, eight inside
`businessIntelligence/` itself, one a code comment in `jobEngine.test.html`, and the one
sanctioned job-registration edge.

### 20.10 Milestone 12C (Sales Intelligence) readiness

Same confirmation as §19 gave for 12B, now doubly proven (two domains built on the same
pipeline, not just one): a Sales Intelligence milestone would add
`sales/salesDataLoader.js` (over `invoices`/`invoice_lines`/`parties` as customers),
`metrics/salesMetrics.js`/`metrics/customerMetrics.js` (reusing
`calculators/turnoverCalculator.js` and `calculators/categoryCalculator.js` as-is, exactly
as Purchase Intelligence did), its own aggregators/recommendations/models, and
`api/salesIntelligenceApi.js` using the identical `createXApi(...)` DI shape — reusing the
SAME shared `insightCache`/`biDiagnostics` singletons with a third, distinct key prefix
(e.g. `salesMetrics:...`), one more additive event type
(`SalesInsightGenerated`)/job id/registration line, and no new capability names. Not
started by this milestone, per its own explicit instruction to stop after 12B.
