# Milestone 12B — Purchase Intelligence Platform: Design

## 1. Goals

Extend the Business Intelligence platform Milestone 12A established
(`js/services/businessIntelligence/`) with a second, read-only domain: Purchase
Intelligence. Average/last/highest/lowest purchase price, price history, cost trend,
rolling purchase average, purchase frequency, supplier comparison and ranking, preferred
supplier, category purchase totals, and advisory purchase recommendations — all
deterministic calculations over purchase history the ERP already stores.

## 2. Current architecture (as it exists today)

Read in full before any code was written: `docs/architecture/platform-roadmap.md`,
`docs/releases/platform-v2-foundation.md`, `docs/architecture/business-intelligence.md`
(§§1–19 as they stood before this milestone), `docs/milestones/milestone-12a-inventory-intelligence.md`,
`docs/reports/milestone-12a-completion.md`, `js/purchases.js`, `js/suppliers.js`, and
every file under `js/services/businessIntelligence/` as 12A left it. Two facts from that
reading shaped this design directly:

1. **12A's own architecture doc had already answered this milestone's central design
   question, speculatively, before it was assigned.** §19 of `business-intelligence.md`
   ("Milestone 12B — reuse confirmation") predicted exactly how a Purchase Intelligence
   milestone would reuse `calculators/categoryCalculator.js` and
   `calculators/turnoverCalculator.js`, and exactly which three registries would need one
   additive entry each. This milestone's brief then explicitly confirmed and tightened
   that prediction: "Extend `js/services/businessIntelligence/`... Reuse the existing
   folders... Do NOT introduce a parallel architecture" — one deviation from the original
   §19 prediction (a separate sibling module) that the brief overrode, corrected honestly
   in `business-intelligence.md` §19 rather than silently deleted.
2. **The database schema is frozen, and `purchase_lines` has no date column of its own** —
   `purchase/purchaseDataLoader.js` must attach each line's own purchase's `bill_date`
   in-memory (a `Map` lookup, zero extra queries) to make dated price history/trend
   possible at all, since 12A's own `invoice_lines` reuse deliberately avoided that exact
   join and stayed lifetime-only. This is the one place Purchase Intelligence's data
   loading does more work than its Inventory Intelligence counterpart, and it is
   documented as such, not hidden.

## 3. Non-goals (explicit, from the brief)

Not built here: a purchasing module (purchase order creation, receiving, automation),
Sales Intelligence (Milestone 12C), a Dashboard UI. Not modified here: purchase workflow,
supplier workflow, inventory/stock workflow, sales workflow, manufacturing, the database
schema, imports/exports, infrastructure, diagnostics' own logic, the Job Engine's dispatch
pipeline, the Audit Platform's record contract, the Extension Framework's lifecycle
manager, or **any file Milestone 12A already built** — confirmed by `git diff` against the
`inventory-intelligence-v1.0` tag returning empty for every 12A file.

## 4. Key design questions answered

**Why does `recommendations/purchaseRecommendations.js` take a pre-computed
`supplierComparison` array as a parameter instead of importing
`aggregators/supplierComparisonAggregator.js` directly?** To preserve the exact layering
`recommendations/reorderRecommendations.js` (12A, frozen) already established:
recommendations import only from `calculators/`, never from `aggregators/` — aggregators
depend on recommendations (via `reorderSummaryAggregator.js`), not the reverse. Per-item
supplier comparison is computed once by the aggregator and passed in by the caller
(`api/purchaseIntelligenceApi.js`), keeping the dependency direction consistent with 12A
rather than introducing a new one for this domain alone.

**Why do `supplierComparisonAggregator.js`, `preferredSupplierAggregator.js`, and
`costHistoryAggregator.js` take the raw `PurchaseSnapshot` instead of a metrics array,
unlike every other aggregator in this platform?** Because the data they need — a
per-supplier, per-item breakdown — is exactly what `metrics/purchaseMetrics.js`
deliberately aggregates away (it sums across every supplier for one item, by design, the
same way 12A's own `itemMetrics.js` never carries a per-batch breakdown once summed).
Rather than force an awkward, non-representative shape into the metrics layer just to
keep every aggregator's signature identical, these three say so explicitly in their own
header comments and take the snapshot directly — a disclosed exception, not a silent
inconsistency.

**Why is `PURCHASE_CREATED` a trigger for both `refreshInventoryInsightsJob` (12A) and
`refreshPurchaseInsightsJob` (12B), and is that a problem?** No — both jobs share the SAME
underlying `insightCache` singleton (§ below), and a purchase genuinely changes both
inventory levels and purchase-price history for that company. Both jobs calling
`insightCache.invalidateCompany(companyId)` is redundant but harmless (idempotent), not a
race condition.

**Why reuse the SAME `insightCache`/`biDiagnostics` singletons instead of building
separate instances per domain, when 12A's own §19 speculated the opposite?** The 12B
brief is explicit: "Reuse the existing cache implementation. Do NOT create another
cache" / "Reuse Diagnostics... Do NOT build another diagnostics framework." Read
literally, one cache and one diagnostics recorder for the whole Business Intelligence
platform is the closer interpretation — made collision-free by prefixing every Purchase
Intelligence cache key `purchaseMetrics:...`, distinct from Inventory's own
`itemMetrics:...` prefix (verified by a direct test in `purchaseIntelligence.test.html`).

**Why no new Extension Framework capability names?** The brief: "Expose extension points
only where necessary. Reuse the existing Business Intelligence extension interfaces. Do
not invent another plugin architecture." The three names 12A already defined
(`InventoryInsightProvider`, `InventoryMetricProvider`, `DashboardCardProvider`) are
sufficient — a purchase-facing extension can use `DashboardCardProvider` for a dashboard
card, or subscribe to `PurchaseInsightGenerated` directly. `extensions/capabilityNames.js`
was not touched.

## 5. Testing approach

Same dependency-injection strategy 12A established: every calculator, aggregator, model
builder, and the API layer's `createPurchaseIntelligenceApi({ loadSnapshot, cache,
diagnostics, recordAudit, resolveActiveCompanyId })` are unit-tested against a hand-built,
deterministic `PurchaseSnapshot` fixture covering all four cost-trend classifications
(rising, falling, stable, insufficient-data), a 3-supplier consolidation candidate, a
2-supplier better-cost-opportunity candidate, and a high/low frequency pair — 95 new
checks in `purchaseIntelligence.test.html`, zero real Supabase calls. Full regression
(1085 checks across 16 suites, 862 carried over unmodified from before 12A + 128 from 12A
+ 95 new) confirmed passing, plus a `git diff` against `inventory-intelligence-v1.0`
confirming zero bytes changed in any 12A file or any core ERP file, plus a re-run of the
same programmatic dependency-cycle-detection script 12A's own verification pass used
(106 files, 260 edges, zero cycles).

## 6. Reading order for whoever picks this up next

1. `docs/architecture/platform-roadmap.md`
2. `docs/milestones/milestone-12a-inventory-intelligence.md` + `docs/reports/milestone-12a-completion.md`
3. This document
4. `docs/architecture/business-intelligence.md` §20 (the living reference for this domain)
5. `docs/reports/milestone-12b-completion.md`
6. `js/services/businessIntelligence/index.js` and `purchaseIntelligence.test.html`
