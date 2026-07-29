# Milestone 12F Completion Report — Business Dashboard Platform

## 1. Architecture Summary

The Business Dashboard is the sixth domain added to the Business Intelligence pipeline,
and the first that is CONSUMER-ONLY — it computes nothing. Per this milestone's own "MOST
IMPORTANT RULE" ("THE DASHBOARD MUST CONTAIN ZERO BUSINESS LOGIC"), the architecture is:

```
Business Intelligence (5 domains, 12A-12E)
  ↓
Business Snapshot Provider  (composes, caches -- no calculation)
  ↓
Dashboard Provider          (maps snapshot -> cards -- no calculation)
  ↓
Dashboard Cards             (17 renderable data descriptors)
  ↓
UI (out of scope for this milestone)
```

`dashboard/businessSnapshotProvider.js` calls all five sibling domains' own
`getXSummary()` functions (`inventoryIntelligence`, `purchaseIntelligence`,
`salesIntelligence`, `pricingIntelligence`, `supplierIntelligence`) in `Promise.all`,
assembles an immutable `BusinessSnapshot` via `models/businessSnapshotModel.js`, and
caches the composed result. `dashboard/dashboardProvider.js` maps that snapshot into 17
Dashboard Cards via `dashboard/dashboardCardDefinitions.js`'s own static, declarative
list. No new metric, calculator, or aggregator exists anywhere in this milestone — the
`alerts`/`kpis` fields on `BusinessSnapshot` are pure selections (filters and property
plucks) over numbers/rows the five domains already computed. The platform remains READ
ONLY: no function here writes to any ERP table or any other domain's own data; the only
side effect any function has is one opt-in Audit Platform entry via
`generateDashboardReport()`.

## 2. BusinessSnapshot Structure

```
BusinessSnapshot {
  companyId, generatedAt, lookbackDays,
  inventory: InventoryInsightModel,   // 12A, embedded by reference, unmodified
  purchase:  PurchaseSummaryModel,    // 12B, embedded by reference, unmodified
  sales:     SalesSummaryModel,       // 12C, embedded by reference, unmodified
  pricing:   PricingSummaryModel,     // 12D, embedded by reference, unmodified
  supplier:  SupplierSummaryModel,    // 12E, embedded by reference, unmodified
  recommendations: { inventory, purchase, sales, pricing, supplier },  // each domain's own .recommendations, passed through
  alerts:    { inventory, purchase, sales, pricing, supplier },        // each domain's own recommendation rows, FILTERED to already-true warning/opportunity flags
  kpis:      { totalInventoryValue, inventoryTurnoverRatio, totalPurchaseValue,
               totalNetSales, overallGrossMarginPct, avgMarginPct, avgMarkupPct,
               supplierCount, totalSupplierPurchaseValue }             // plucked, zero arithmetic
}
```

Deep-frozen recursively via `shared/freezeDeep.js`'s existing `deepFreeze()` (reused
verbatim) — every embedded domain model is already frozen by its own domain, so
re-freezing it is a documented no-op, not a second freeze pass. Full field-by-field
contract: `docs/architecture/business-intelligence-api.md` §10.

**A disclosed interpretation choice**: the brief's own illustrative `BusinessSnapshot`
example lists `dashboardCards` as one of its own fields; the implemented model has no
such field. Cards are derived FROM a snapshot by `dashboard/dashboardProvider.js`, never
stored ON one — read as more consistent with the brief's own two-box architecture
diagram and its own "Every dashboard card consumes this object. Nothing else." (full
reasoning: `docs/architecture/business-intelligence.md` §24.5).

## 3. Files Added (8, plus this report = 9)

```
js/services/businessIntelligence/models/businessSnapshotModel.js
js/services/businessIntelligence/dashboard/businessSnapshotProvider.js
js/services/businessIntelligence/dashboard/dashboardCardDefinitions.js
js/services/businessIntelligence/dashboard/dashboardProvider.js
js/services/businessIntelligence/audit/dashboardAuditReporter.js
js/services/businessIntelligence/api/dashboardApi.js
js/services/businessIntelligence/businessDashboard.test.html
docs/milestones/milestone-12F-business-dashboard.md
docs/reports/milestone-12F-completion.md   (this file)
```

Note: no new file under `metrics/`, `calculators/`, `aggregators/`, `recommendations/`,
or `jobs/` — the leanest file list of any milestone in this platform, matching this
domain's own "zero business logic" mandate literally.

## 4. Files Modified (6, all additive)

```
js/services/businessIntelligence/index.js                        (+Milestone 12F export block)
js/services/events/registry/eventTypes.js                        (+'dashboard' aggregate, +DASHBOARD_GENERATED)
js/services/audit/registry/auditRegistry.js                      (+DASHBOARD_GENERATED entry)
docs/architecture/business-intelligence.md                       (+§24 Business Dashboard)
docs/architecture/business-intelligence-api.md                    (+§9 Business Dashboard APIs, renumbered §§10-14)
docs/architecture/platform-roadmap.md                             (Living Architecture Documents bullet only, per this milestone's own explicit instruction)
```

Notably absent from this list, unlike every prior milestone: `shared/config.js` (no new
threshold needed), `jobs/registry/jobIds.js` and
`jobs/bootstrap/startBackgroundInfrastructure.js` (no new job needed, §8). No file
belonging to Milestones 1–11F or 12A–12E's own domain logic was touched at all.

## 5. Reuse Audit (mandatory, per this milestone's own brief)

### Components Composed

`inventoryIntelligence.getInventorySummary()` (12A), `purchaseIntelligence.getPurchaseSummary()`
(12B), `salesIntelligence.getSalesSummary()` (12C), `pricingIntelligence.getPricingSummary()`
(12D), `supplierIntelligence.getSupplierSummary()` (12E) — every one of the five sibling
domains' own full company-wide summary, called verbatim.

### Components Reused Verbatim

`cache/insightCache.js`, `diagnostics/biDiagnostics.js`, `shared/freezeDeep.js`,
`extensions/capabilityNames.js`'s three existing capabilities.

### Components Generalized

None — there was no existing calculator/aggregator whose shape needed a thin remap;
every reuse in this milestone is either a direct domain-API call (Components Composed)
or an as-is shared utility (Components Reused Verbatim).

### New Components, and justification for each

| File | Justification |
|---|---|
| `models/businessSnapshotModel.js` | Pure assembly + deep-freeze of the pieces `businessSnapshotProvider.js` composes — no existing model spans five domains. |
| `dashboard/businessSnapshotProvider.js` | The five-domain composition + `selectAlerts()`/`selectKpis()` (both pure selections, never a calculation) — no prior domain composed more than four sibling APIs. |
| `dashboard/dashboardCardDefinitions.js` | A static, declarative list — no existing config file names dashboard-card metadata. |
| `dashboard/dashboardProvider.js` | Maps a snapshot to cards via pure property selection — no existing file performs this mapping. |
| `audit/dashboardAuditReporter.js` | One new, narrow bridge publishing one new, additive event type, mirroring every prior domain's own audit reporter. |
| `api/dashboardApi.js` | The composition root for this domain, wiring the two providers above together. |

### A real, disclosed race condition found during test construction

On a COLD cache, `purchaseIntelligence.getPurchaseMetricsSnapshot()` can be reached
twice within one `getBusinessSnapshot()` call — once directly
(`purchaseIntel.getPurchaseSummary()`, part of this domain's own `Promise.all`) and once
indirectly (`supplierIntel.getSupplierSummary()` independently composes `purchaseIntel`
too, per its own 12E design) — both racing against the same still-cold cache entry
before either populates it, so one may reload unnecessarily. Not a bug in either
domain's own cache logic — an inherent property of composing an already-composing
sibling. Disclosed in `docs/architecture/business-intelligence.md` §24.4 and in
`businessDashboard.test.html`'s own comments; the test's own load-count assertion was
fixed to check what actually matters (a REPEAT call touches no sibling API at all) rather
than a brittle exact count on the necessarily-concurrent first call. See §11 (Risks).

## 6. Public APIs

`businessDashboard`/`createDashboardApi` (`api/dashboardApi.js`): `getBusinessSnapshot`,
`getDashboardSummary`, `getDashboardCards`, `generateDashboardReport`. Two internal,
independently-reusable providers also exported from `index.js`:
`businessSnapshotProvider`/`createBusinessSnapshotProvider`
(`dashboard/businessSnapshotProvider.js`) and `dashboardProvider`/`createDashboardProvider`
(`dashboard/dashboardProvider.js`). Full function-by-function contract:
`docs/architecture/business-intelligence-api.md` §9 (which also moves the platform's
version table from `v2.0 (reserved)` to `v2.0` delivered, and folds the old §14.1
"Business Dashboard — reserved" placeholder into the now-real API — §14 Future Reserved
APIs is now empty, every domain named in any revision of that document having been
implemented through this milestone).

## 7. Dashboard Flow

```
1. UI (or a test, or a future report generator) calls businessDashboard.getDashboardCards({companyId, lookbackDays?})
2. dashboardApi.js delegates to dashboardProvider.getDashboardCards()
3. dashboardProvider.js calls businessSnapshotProvider.getBusinessSnapshot()
4. businessSnapshotProvider.js checks its own cache (key: businessSnapshot:${lookbackDays})
     -- cache HIT: return the cached, frozen BusinessSnapshot immediately (no sibling API touched)
     -- cache MISS: call all five sibling getXSummary() functions in Promise.all,
        compose alerts/kpis/recommendations, build + freeze the BusinessSnapshot,
        cache it, return it
5. dashboardProvider.js maps the snapshot through DASHBOARD_CARD_DEFINITIONS'
   17 static {id, title, domain, kind, select} entries -- one select(snapshot)
   call per card, each a pure property pluck/filter
6. Returns a frozen DashboardCard[] -- 17 entries, zero calculation performed
   in steps 5-6, zero ERP/database access anywhere in steps 1-6
```

`generateDashboardReport()` follows the identical path through step 4, then additionally
calls `recordDashboardGenerated()` to publish `EVENT_TYPES.DASHBOARD_GENERATED` before
returning the same snapshot.

## 8. Regression Results

Full existing regression suite (20 `.test.html` files spanning every platform) re-run
headlessly (`python -m http.server` + `chrome --headless=new --dump-dom`) after every
implementation change:

```
forms.test.html ................................ 80/80 passed
dataExchange.test.html .......................... 43/43 passed
migration.test.html ............................. 48/48 passed
eventBus.test.html .............................. 58/58 passed
jsonExport.test.html ............................ 58/58 passed
jsonImport.test.html ............................ 59/59 passed
xmlExport.test.html ............................. 77/77 passed
xmlImport.test.html ............................. 87/87 passed
apnabill.test.html .............................. 52/52 passed
apnabillRestore.test.html ....................... 72/72 passed
diagnostics.test.html ........................... 68/68 passed
audit.test.html .................................. 62/62 passed
extensionFramework.test.html .................... 64/64 passed
businessIntelligence.test.html (12A) ........... 128/128 passed
purchaseIntelligence.test.html (12B) ............ 95/95 passed
salesIntelligence.test.html (12C) ............... 90/90 passed
pricingIntelligence.test.html (12D) ............. 80/80 passed
supplierIntelligence.test.html (12E) ............ 59/59 passed
businessDashboard.test.html (12F, new) .......... 40/40 passed
jobEngine.test.html ............................. 54/54 passed (UNCHANGED -- see below)
```

Total: **1,374 checks passing across 20 files.**

**`jobEngine.test.html` required NO update this time** — its hardcoded job-registration
count stayed at the exact figure 12E left it (8), since this milestone registered no new
job (§8's own "one deliberate omission"). This is itself a regression-suite confirmation
that the "no new job" design decision was correctly load-bearing, not just theoretically
sound: `startBackgroundInfrastructure()` really was left completely untouched.

**Inventory Intelligence (12A), Purchase Intelligence (12B), Sales Intelligence (12C),
Pricing Intelligence (12D), and Supplier Intelligence (12E) are unchanged**: confirmed by
their own test suites passing unmodified and by `git status` showing zero changes to any
of their own calculator/aggregator/metric/model/recommendation/API files. **ERP is
unchanged**: no `schema.sql` change, no `js/items.js`/`js/purchase.js`/`js/sales.js`/
`js/inventory.js`/`js/parties.js` change.

## 9. Performance Notes

Exactly the shape this milestone's own "Performance" section demands: **ONE snapshot
composition (five calls, one per sibling domain, in parallel via `Promise.all`), not 20
API calls.** Each of the five calls is itself already cache-checked and
diagnostics-wrapped by its own domain — this milestone adds no additional query of any
kind. The composed `BusinessSnapshot` is cached under its own `businessSnapshot:${lookbackDays}`
key (sixth prefix, same shared `insightCache` singleton), so a repeat call for the same
company/window touches no sibling API at all, not just avoids recomputing the
alerts/kpis selection. `useCache: false` is forwarded to every sibling call this domain
composes, so one flag bypasses every layer of caching the whole composition touches.
`dashboard/dashboardProvider.js`'s own card mapping is O(17) property plucks over an
already-built snapshot — negligible next to the snapshot composition itself, and not
independently cached (recomputing 17 property reads on every call is cheaper than the
complexity of a second, redundant cache layer this milestone's own brief warns against
"No second caching system"). Diagnostics reuse (same shared `biDiagnostics` instance)
emits `bi:computeBusinessSnapshot` (snapshot generation / provider execution time) and
`bi:generateDashboardCards` (widget generation time) exactly as the brief's own
"DIAGNOSTICS" section names them.

## 10. Risks

- **The cold-cache concurrent-composition race (§5's own disclosed finding).** On a cold
  cache, composing an already-composing sibling (Supplier Intelligence) can cause one
  extra sibling-domain load the very first time `getBusinessSnapshot()` is called for a
  given company/window. Self-corrects completely on every subsequent call. No consumer
  ever observes incorrect data from this — only a marginally more expensive first call.
- **`BusinessSnapshot` is only as fresh as its slowest embedded domain's own cache.**
  Since each of the five `getXSummary()` calls independently hits its own domain's
  cache-or-recompute path, a `BusinessSnapshot` built while four domains' caches are
  warm but one was just invalidated will recompute that one domain fresh while serving
  the other four from cache — this is correct (no torn read; each domain's own value is
  internally consistent), but means "how stale can a BusinessSnapshot be" is bounded by
  the SAME 5-minute `DEFAULT_CACHE_TTL_MS` every prior domain already accepts, not a new
  risk this milestone introduces.
- **"Today's Sales"/"Today's Purchases" are not calendar-day-accurate** (§4's own
  disclosed design choice) — they reflect the snapshot's own configured `lookbackDays`
  window total. A caller wanting a literal single day must pass `lookbackDays: 1`
  explicitly, which then applies to every other card on that same call too.

## 11. Technical Debt (disclosed, none blocking)

- `getDashboardCards()` does not merge `DashboardCardProvider` extension-contributed
  cards into its own returned 17-entry array. The capability itself has existed since
  12A, unused by any real provider; wiring it into this domain's own card list was not
  requested by this milestone's own brief and was not spent effort on speculatively.
- `dashboard/businessSnapshotProvider.js`'s `selectAlerts()` picks a specific subset of
  each domain's own boolean flags as "alert-worthy" (e.g., pricing's `lowMarginWarning`/
  `highDiscountWarning`/`priceConsistencyWarning`/`supplierCostIncreaseAlert`, but not
  `priceIncreaseOpportunity`/`priceReductionOpportunity`, which are framed as
  opportunities rather than warnings). This is a disclosed editorial judgment call about
  what counts as "alert-worthy" per domain, not a hidden inconsistency — a future
  consumer wanting a different cut can read `snapshot.pricing.recommendations` (or any
  other domain's own full recommendation list) directly, since `BusinessSnapshot`
  exposes both the filtered `alerts` view and the complete underlying
  `recommendations`/embedded summary models.

## 12. Merge Readiness

Architecturally complete and internally consistent: reuses the frozen pipeline exactly,
introduces zero parallel pipeline, zero new metric/calculator/aggregator, zero schema
change, zero workflow change, zero API breaking change, and — per this milestone's own
"MOST IMPORTANT RULE" — contains zero business logic anywhere in its own files. Full
regression suite green (20/20 test files, 1,374 total checks passing across the whole
repository as of this report), including confirmation that `jobEngine.test.html` needed
no update (proof the "no new job" design decision holds). Documentation complete:
`docs/architecture/business-intelligence.md` §24, `docs/architecture/business-intelligence-api.md`
§9 (plus the renumbering of §§10–14, the version-table update to v2.0 delivered, and
folding the now-empty §14 Future Reserved APIs section), `docs/milestones/milestone-12F-business-dashboard.md`,
and this report. `docs/architecture/platform-roadmap.md` was updated ONLY in its Living
Architecture Documents section, per this milestone's own explicit instruction — its
Completed Milestones table, Current Repository Status, and Repository Checkpoints table
are deliberately untouched pending approval.

**Per this milestone's own explicit brief: STOP here. Do not commit, merge, tag, or
push. This branch (`milestone-12f-business-dashboard`) remains uncommitted, awaiting
architecture review.**
