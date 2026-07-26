# Milestone 12A Completion Report — Inventory Intelligence Platform

**Branch:** `milestone-12` · **Date:** 2026-07-26

This is a completion report, not a design document. It records what was actually built
and verified for this milestone. For architecture rationale, see
`docs/milestones/milestone-12a-inventory-intelligence.md` (design) and
`docs/architecture/business-intelligence.md` (the living reference, not repeated here).
Unlike prior release checkpoints under `docs/releases/`, this report does not claim a git
tag or a push to `origin` — no commit, tag, or push was made as part of writing this
report; those remain the user's own action.

## Summary

Milestone 12A adds `js/services/businessIntelligence/` — a read-only Business
Intelligence layer over the existing Inventory/Items/Purchases/Sales modules. No database
schema change, no change to any existing ERP business logic (`js/items.js`,
`js/purchases.js`, `js/sales.js`, `schema.sql` are byte-for-byte unchanged), and no
Dashboard UI (explicitly out of scope for this milestone). Three existing platform
registries were extended using their own documented, additive "add one entry" mechanisms
(`events/registry/eventTypes.js`, `audit/registry/auditRegistry.js`,
`jobs/registry/jobIds.js`), plus one line added to `jobs/bootstrap/startBackgroundInfrastructure.js`
to register one new job via that file's own documented extension point. Full regression:
**990/990 passing** across 15 suites (862 carried over unmodified + 128 new).

## 1. Architecture Summary

```
ERP (items, batches, stock_ledger, invoice_lines -- read only)
  -> Metrics (metrics/itemMetrics.js)
  -> Calculators (calculators/*.js)
  -> Aggregators (aggregators/*.js)
  -> Insight Models (models/insightModels.js)
  -> Business Intelligence Services (api/inventoryIntelligenceApi.js)
  -> Dashboard / Reports / Extensions (not built by this milestone)
```

Full module map, dependency direction, and every design decision: see
`docs/architecture/business-intelligence.md` §§2–3.

## 2. Files Added (25)

**Platform code (21)**, all under `js/services/businessIntelligence/`:
- `index.js` (barrel)
- `shared/freezeDeep.js`, `shared/now.js`
- `inventory/inventoryDataLoader.js`
- `metrics/itemMetrics.js`
- `calculators/inventoryValueCalculator.js`, `calculators/stockAgeCalculator.js`,
  `calculators/turnoverCalculator.js`, `calculators/movementCalculator.js`,
  `calculators/categoryCalculator.js`
- `aggregators/lowStockAggregator.js`, `aggregators/outOfStockAggregator.js`,
  `aggregators/deadStockAggregator.js`, `aggregators/slowMovingAggregator.js`,
  `aggregators/fastMovingAggregator.js`, `aggregators/overstockAggregator.js`,
  `aggregators/inventorySummaryAggregator.js`, `aggregators/categorySummaryAggregator.js`,
  `aggregators/reorderSummaryAggregator.js`
- `recommendations/reorderRecommendations.js`
- `models/insightModels.js`
- `diagnostics/biDiagnostics.js`
- `cache/insightCache.js`
- `audit/biAuditReporter.js`
- `extensions/capabilityNames.js`
- `api/inventoryIntelligenceApi.js`
- `jobs/refreshInventoryInsightsJob.js`

**Test (1):** `js/services/businessIntelligence/businessIntelligence.test.html` (128 checks).

**Documentation (3):** `docs/architecture/business-intelligence.md`,
`docs/milestones/milestone-12a-inventory-intelligence.md`, this report.

## 3. Files Modified (5, all additive per each file's own documented extension mechanism)

- `js/services/events/registry/eventTypes.js` — added `'inventoryInsight'` to
  `AGGREGATES`, added one new entry (`INVENTORY_INSIGHT_GENERATED`) to
  `EVENT_CONTRACTS`. No change to `bus/eventBus.js`, `contracts/eventEnvelope.js`, or
  `context/eventContext.js`.
- `js/services/audit/registry/auditRegistry.js` — added one entry to
  `AUDIT_RECORD_VERSIONS` for the new event type. No change to `subscriber/`, `store/`,
  or `query/`.
- `js/services/jobs/registry/jobIds.js` — added one entry (`REFRESH_INVENTORY_INSIGHTS`)
  to `JOB_IDS`. No change to `dispatcher/jobDispatcher.js`, `lifecycle/jobLifecycle.js`,
  or `contracts/jobContract.js`.
- `js/services/jobs/bootstrap/startBackgroundInfrastructure.js` — one new import and one
  new `jobDispatcher.registerJob(...)` call, per this file's own documented extension
  point (`docs/job-engine-architecture.md` §11).
- `js/services/jobs/jobEngine.test.html` — one pre-existing assertion
  (`"...all 3 jobs registered"`, hardcoded to a literal `3`) updated to `4`, reflecting the
  legitimately-changed job count from the line above. This is the one existing test file
  this milestone touched; every other of the 14 pre-existing suites required zero changes.

`docs/architecture/platform-roadmap.md` was **not** modified in the way prior milestones
updated it (adding a new completed-milestone row) — per that document's own §9 rule
("updated only when an architectural phase is completed... not speculatively ahead of
approved work") and §6 ("no further infrastructure milestone is currently approved"),
12A is v2 feature work built *on* the closed infrastructure roadmap, not a new
infrastructure phase — the roadmap's own "Upcoming Roadmap" framing does not describe
this kind of work. `docs/architecture/business-intelligence.md` is the living reference
for this platform going forward, the same role the five Milestone 11 architecture
documents play for their own platforms.

## 4. Service Dependency Diagram

```
businessIntelligence/
  ├── inventory/ ───────────► js/supabaseClient.js (supa, getActiveCompanyId)
  ├── metrics/ ─────────────► calculators/
  ├── calculators/ ─────────► (each other, where noted; otherwise no internal deps)
  ├── aggregators/ ─────────► calculators/, recommendations/ (reorderSummaryAggregator only)
  ├── recommendations/ ─────► calculators/movementCalculator.js
  ├── models/ ───────────────► shared/freezeDeep.js
  ├── diagnostics/ ─────────► ../diagnostics/ (public barrel)
  ├── cache/ ────────────────► (no internal deps)
  ├── audit/ ────────────────► ../events/ (public barrel) -- publishes, never writes an audit record
  ├── extensions/ ──────────► (no internal deps; discovery-only over extensionRuntime.capabilityRegistry)
  ├── api/ ──────────────────► inventory/, metrics/, aggregators/, models/, diagnostics/, cache/, audit/
  └── jobs/ ─────────────────► ../events/ (public barrel), ../jobs/registry+contracts (direct subfolder
                                imports, not jobs/index.js -- avoids a circular import back through
                                jobs/bootstrap/startBackgroundInfrastructure.js), cache/, api/

jobs/bootstrap/startBackgroundInfrastructure.js ─────► businessIntelligence/jobs/refreshInventoryInsightsJob.js
```

None of `events/`, `diagnostics/`, `jobs/`, `audit/`, or `extensions/` import anything
from `businessIntelligence/` — confirmed by grep — the same "depends on everything below
it, nothing below it depends back" shape `extensions/` itself established for the
Infrastructure Platform.

## 5. Public APIs Added

See `docs/architecture/business-intelligence.md` §4 for the full table. Summary:
`inventoryIntelligence.{getInventorySummary, getInventoryValue, getLowStockItems,
getOutOfStockItems, getDeadStock, getSlowMovingItems, getFastMovingItems,
getOverstockItems, getCategoryPerformance, getInventoryTurnover,
getReorderRecommendations, generateInventoryInsightReport}`, plus
`createInventoryIntelligenceApi(deps)` for isolated/test instances, plus every
calculator/aggregator/model-builder re-exported from `index.js` for direct reuse by a
future Dashboard/Report/Extension.

## 6. Regression Results

| Suite | Result |
|---|---|
| `audit/audit.test.html` | 62/62 ✅ |
| `dataExchange/apnabill/apnabill.test.html` | 52/52 ✅ |
| `dataExchange/apnabill/apnabillRestore.test.html` | 72/72 ✅ |
| `dataExchange/dataExchange.test.html` | 43/43 ✅ |
| `dataExchange/json/jsonExport.test.html` | 58/58 ✅ |
| `dataExchange/json/jsonImport.test.html` | 59/59 ✅ |
| `dataExchange/migration/migration.test.html` | 48/48 ✅ |
| `dataExchange/xml/xmlExport.test.html` | 77/77 ✅ |
| `dataExchange/xml/xmlImport.test.html` | 87/87 ✅ |
| `diagnostics/diagnostics.test.html` | 68/68 ✅ |
| `events/eventBus.test.html` | 58/58 ✅ |
| `extensions/extensionFramework.test.html` | 64/64 ✅ |
| `jobs/jobEngine.test.html` | 54/54 ✅ (updated: 3→4 registered jobs, §3) |
| `ui/forms/forms.test.html` | 80/80 ✅ |
| `businessIntelligence/businessIntelligence.test.html` (new) | 128/128 ✅ |
| **Total** | **990/990 ✅** |

Run via `python -m http.server` + headless Chrome `--dump-dom`, the same zero-build-step
harness convention every prior milestone uses. The suite was first run **before** any
registry edit to confirm the 862-check baseline, then again after every code change to
confirm the only delta was the one expected, disclosed `jobEngine.test.html` count update
(§3) — no other suite's pass count changed.

## 7. Performance Notes

- `inventory/inventoryDataLoader.js` runs exactly four company-scoped queries (`items`,
  `batches`, `stock_ledger` bounded to `lookbackDays`, `invoice_lines`) per snapshot load,
  plus one additional narrowly-scoped, unbounded `stock_ledger` query only for items that
  are stock-tracked but not batch-tracked — never one query per item, never one query per
  insight.
- `api/inventoryIntelligenceApi.js` caches the computed per-item metrics array for 5
  minutes per `{companyId, lookbackDays, activeOnly}` (`cache/insightCache.js`); every
  `getX()` call within that window reuses the same in-memory array rather than
  re-scanning.
- Every calculator and aggregator is O(n) over the item list (or O(1) per item), with no
  nested per-item re-scans of `batches`/`stock_ledger`/`invoice_lines` — those were
  already grouped by item once, in `inventory/inventoryDataLoader.js`.
- `jobs/refreshInventoryInsightsJob.js` invalidates and warms only the affected company's
  cache entry on a trigger event, not the whole cache.

## 8. Risks Found

None that block this milestone. One modeling tension worth naming: `isOverstock()` and
`isSlowMoving()` are independent predicates and can both be true for the same item (an
item with very low sales velocity naturally has both a low turnover ratio and a high
days-of-cover) — this is realistic, not a bug, and is exercised deliberately by
`businessIntelligence.test.html`'s `item-over` fixture, which appears in both lists.

## 9. Technical Debt (disclosed, none blocking)

Same category of disclosed limitation as every prior platform's own report — see
`docs/architecture/business-intelligence.md` §6 for the full list:
- No `category` column exists on `items`; `hsn_sac` is used as a disclosed proxy.
- No reservation/sales-order concept; `reservedStock` is always `0`.
- Average Selling Price is a lifetime average (no date column on `invoice_lines`).
- Average Cost reflects current stock's cost basis, not historical purchase price.
- COGS/turnover is understated for non-batch-tracked items (`stock_ledger.unit_cost` is
  `null` on their `'sale'` rows by the existing `sale_rpc.sql`'s own design).
- `stock_ledger` is read within a bounded `lookbackDays` window, not unbounded.
- No automated test harness exists for `inventory/inventoryDataLoader.js`'s own four
  Supabase queries — reviewed by inspection, the same disclosed limitation every Core ERP
  file already has.
- No Dashboard UI consumes this platform yet — by design, explicitly out of scope for
  this milestone.

## 10. Readiness Assessment for Milestone 12B (Purchase Intelligence)

**Ready.** This milestone establishes and proves out (via its own test suite) three
reusable patterns a Purchase Intelligence milestone can follow directly:

1. **The layered pipeline** (Metrics → Calculators → Aggregators → Insight Models →
   Services) as a concrete, working example, not just a diagram.
2. **The dependency-injection composition root shape**
   (`createXApi({ loadSnapshot, cache, diagnostics, recordAudit, resolveActiveCompanyId })`)
   — proven to make a Supabase-backed service layer fully unit-testable without a real
   database.
3. **The three sanctioned registry-extension points** (a new Domain Event type for
   audit-worthy facts, a new Job Engine registration for scheduled cache warming, a new
   Extension Framework capability name for discovery) — all exercised once, successfully,
   here.

A Purchase Intelligence milestone would need its own data loader (over
`purchases`/`purchase_lines`, and/or `parties` for supplier-side metrics), its own
metrics/calculators/aggregators (e.g. supplier performance, purchase price variance,
lead-time analysis), and would likely want to reuse `calculators/categoryCalculator.js`
and `calculators/turnoverCalculator.js` as-is if its own metrics need the same category
proxy or velocity math — nothing under `businessIntelligence/` would need to change to
support that reuse (`index.js` already re-exports both individually alongside the
platform's own API layer). Not started by this milestone, per its own explicit
instruction to stop after 12A.

## 11. Post-Completion Verification Addendum

Added after this report's original text above (same branch, same day) in response to a
follow-up verification pass, not a new milestone. Full detail lives in
`docs/architecture/business-intelligence.md` §§15–19; summarized here:

- **Dependency graph, verified programmatically** (not by inspection): 84 files across
  `businessIntelligence/` + its five external touchpoints, 180 import edges, **zero
  cycles** — including the one edge that could plausibly have become one
  (`jobs/bootstrap/startBackgroundInfrastructure.js` → `businessIntelligence/jobs/refreshInventoryInsightsJob.js`).
- **Magic-number consolidation**: a new `shared/config.js` was added as the single source
  of truth for every tunable numeric constant (`MS_PER_DAY`, `DAYS_PER_YEAR`,
  `DEFAULT_LOOKBACK_DAYS`, `DEFAULT_CACHE_TTL_MS`, `MOVEMENT_DEFAULTS`,
  `REORDER_DEFAULTS`) — two genuine duplications were found and fixed
  (`DEFAULT_LOOKBACK_DAYS` was defined separately in both
  `inventory/inventoryDataLoader.js` and `api/inventoryIntelligenceApi.js`; `MS_PER_DAY`
  separately in both `calculators/stockAgeCalculator.js` and `metrics/itemMetrics.js`),
  plus one previously-inline literal named (`turnoverCalculator.js`'s `365`) and one
  previously-inline heuristic multiplier named (`reorderRecommendations.js`'s
  `lowStockThreshold * 2` → `REORDER_DEFAULTS.noVelocityRestockMultiplier`). No existing
  public export name changed; every value is identical to before the refactor. Full
  990/990 regression re-run and confirmed passing after this change.
- **UI/ERP boundary**, re-confirmed by grep across the whole repository: zero production
  BI files reference `js/ui`, `document.`, or `window.`; zero ERP files
  (`js/items.js`, `js/sales.js`, `js/purchases.js`, etc.) or `.html` pages reference
  `businessIntelligence` — only the one already-documented job-registration edge exists.
- **Cache design** was documented in full (scope, invalidation, memory ownership,
  lifecycle) — no code change resulted from this part of the review; the existing design
  was found sound as built.
- **Milestone 12B reuse** was confirmed concretely, step by step, against the actual
  shape of `api/inventoryIntelligenceApi.js`'s dependency-injection seam and
  `cache/insightCache.js`'s/`diagnostics/biDiagnostics.js`'s factory functions — not just
  asserted.
