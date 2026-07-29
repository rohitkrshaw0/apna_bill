# Milestone 12C — Sales Intelligence Platform: Design

## 1. Goals

Extend the Business Intelligence platform (Milestones 12A/12B) with a third, read-only
domain: Sales Intelligence. Average/last/highest/lowest selling price, revenue (gross/net/
returns), gross margin, sales trend, sales frequency/velocity, top/worst selling items,
category and customer ranking, seasonality, and advisory recommendations (high demand,
declining products, customer retention, upsell, cross-sell) — all deterministic
calculations over sales history the ERP already stores.

## 2. Current architecture (as it exists today)

Read in full before any code was written: `docs/architecture/platform-roadmap.md`,
`docs/releases/platform-v2-foundation.md`, `docs/architecture/business-intelligence.md`
(§§1–20 as 12B left them), `docs/architecture/business-intelligence-api.md` (the full
public contract as 12B left it), both prior milestones' design/completion docs,
`js/sales.js`, and every file under `js/services/businessIntelligence/` as 12B left it.
Two facts from that reading shaped this design directly:

1. **12B's own completion report and architecture doc had already predicted this
   milestone's shape, twice.** `docs/reports/milestone-12b-completion.md` §13 and
   `docs/architecture/business-intelligence.md` §20.10 both named the exact reusable
   components (`categoryCalculator.js`, `turnoverCalculator.js`, the `createXApi(...)` DI
   shape, a third distinct cache-key prefix) a Sales Intelligence milestone would need.
   This milestone confirms those predictions were accurate, and goes further: it reuses
   **more** of 12B's own work verbatim than either prediction anticipated (see §4 below
   and the milestone's own Reuse Audit,
   `docs/reports/milestone-12c-completion.md` §4).
2. **The "Reuse Audit" instruction this milestone's own brief adds is new, and changed the
   design process itself.** Rather than writing new calculators/aggregators for every
   brief bullet and documenting reuse as an afterthought, every metric/aggregator/
   recommendation was designed by first asking "does an existing 12A/12B function already
   compute this, under a different name, for a different domain?" — and in several cases
   (average/last/highest/lowest price, rolling average, cost trend, sales velocity,
   frequency annualization, spend/order-value totals, item/customer ranking, "top N"
   selection) the answer was yes, verbatim, with zero modification.

## 3. Non-goals (explicit, from the brief)

Not built here: Milestone 12D, a Dashboard UI, any change to Sales/Invoice/Customer/
Inventory/Purchase/Manufacturing workflow, any database schema change, any API breaking
change. Not modified here: any file Milestones 12A or 12B already built (confirmed by
`git diff` against the `purchase-intelligence-v1.0` tag returning empty for every one of
them), the cache architecture, the diagnostics integration, the extension contracts, or
any shared model — this milestone adds new, additive fields and new, additive models,
never renames or removes an existing one.

## 4. Key design questions answered

**Why does `metrics/salesMetrics.js` compute `costTrend` (not `salesTrend`) internally,
and why does `sales/salesDataLoader.js` attach a `billDate` alias equal to `invoiceDate`
onto every line?** So that `calculators/averagePriceCalculator.js`'s four price-stat
functions and `calculators/purchaseTrendCalculator.js`'s `calculateRollingPurchaseAverage()`/
`calculateCostTrend()` — all frozen, all already domain-agnostic in their actual field
access (`.qty`/`.rate`/`.billDate`, nothing purchase-specific in the logic itself) — can be
called **verbatim**, unmodified, against sale lines instead of purchase lines. This is
also exactly why `aggregators/purchaseTrendSummaryAggregator.js` (12B, frozen) can be
reused verbatim too: it buckets by `.costTrend`, and sales metrics keep that same field
name specifically to make that reuse possible. This is the single biggest reuse decision
in this milestone, and it is documented at the point of reuse (`metrics/salesMetrics.js`'s
own header comment), not just in a summary document.

**Why is there no `salesFrequencySummaryAggregator.js` reuse of 12B's
`purchaseFrequencySummaryAggregator.js`, when the pattern is otherwise so reuse-heavy?**
Because that function hardcodes `.purchaseFrequencyPerYear` — a field name that would be
actively misleading on a public-facing Sales Intelligence row (unlike `costTrend`, a
genuinely domain-neutral name). This is the one deliberate exception to this milestone's
reuse-heavy design, and it is called out explicitly rather than silently reusing something
that would produce wrong results (the frozen function's filter would silently return empty
results against a field it doesn't recognize).

**Why do `aggregators/customerRankingAggregator.js` and `aggregators/revenueRankingAggregator.js`
exist as separate files instead of consumers calling `aggregateSupplierRanking` directly?**
Because `aggregateSupplierRanking` is a name that would be confusing at a Sales
Intelligence call site (ranking customers or items, not suppliers) — API naming clarity
matters for a platform contract document (`business-intelligence-api.md`). Both are
one-line delegations, adding zero new ranking logic, the same "generalize by composition"
precedent `calculators/purchaseFrequencyCalculator.js` (12B) already established for
`calculateDailySalesVelocity()`.

**Why does `aggregators/worstSellingItemsAggregator.js` exist as a new file instead of
reusing `aggregators/topPurchasedItemsAggregator.js` with a flag?** That function's sort
direction is hardcoded descending — inverting it is a different behavior, not achievable
by calling the frozen function with different arguments. A new, ~10-line file was the
honest choice over stretching a frozen function's contract.

**Is "Return Rate" real data, given `js/sales.js`'s own `saveSaleFromCart()` always writes
`doc_type = 'sale'`?** No — mirroring the exact same disclosed limitation
`purchase/purchaseDataLoader.js` (12B) already established for purchase returns:
`invoices.doc_type` allows `'sale_return'` by schema, but no workflow in this ERP writes
one today. `calculateReturnRate()` is implemented and will read `0`/`null` for every real
company until a future milestone implements sale returns against the existing schema — at
which point it becomes meaningful with no code change here.

**Why does the customer-level "cross-sell"/"upsell" recommendation take precomputed
`companyAvgOrderValue`/`topCategories` as plain arguments instead of recomputing them?**
Same discipline `recommendations/purchaseRecommendations.js`'s `supplierComparison`
parameter already established: a recommendation function is pure and never re-derives
data the caller (`api/salesIntelligenceApi.js`) already computed via an aggregator.

## 5. Testing approach

Same dependency-injection strategy as 12A/12B: every calculator, aggregator, model
builder, and `createSalesIntelligenceApi({ loadSnapshot, cache, diagnostics, recordAudit,
resolveActiveCompanyId })` are unit-tested against a hand-built, deterministic
`SalesSnapshot` fixture covering all four cost-trend classifications, a return (for gross/
net/return-rate), a margin-testable item alongside a no-batch-cost item, a high-demand
item, a low-performing item, and three customers exercising all three recommendation
flags (retention, upsell, cross-sell) in both their true and false states — 90 new checks
in `salesIntelligence.test.html`, zero real Supabase calls. Full regression (1175 checks
across 17 suites, 862 carried over unmodified from before 12A + 128 from 12A + 95 from
12B, all three unmodified + 90 new) confirmed passing, a `git diff` against
`purchase-intelligence-v1.0` confirming zero bytes changed in any 12A/12B file or any core
ERP file, and a re-run of the same programmatic dependency-cycle-detection script both
prior milestones used (123 files, 327 edges, zero cycles).

## 6. Reading order for whoever picks this up next

1. `docs/architecture/platform-roadmap.md`
2. `docs/milestones/milestone-12a-inventory-intelligence.md` + `docs/reports/milestone-12a-completion.md`
3. `docs/milestones/milestone-12b-purchase-intelligence.md` + `docs/reports/milestone-12b-completion.md`
4. This document
5. `docs/architecture/business-intelligence.md` §21 (the living reference for this domain)
6. `docs/architecture/business-intelligence-api.md` (the public API contract, extended)
7. `docs/reports/milestone-12c-completion.md` (includes the mandatory Reuse Audit)
8. `js/services/businessIntelligence/index.js` and `salesIntelligence.test.html`
