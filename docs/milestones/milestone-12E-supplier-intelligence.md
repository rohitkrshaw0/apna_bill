# Milestone 12E — Supplier Intelligence Platform: Design

## 1. Goals

Extend the Business Intelligence platform (Milestones 12A/12B/12C/12D) with a fifth,
read-only, advisory-only domain: Supplier Intelligence. Per-supplier purchase volume/
value/frequency, product count and category distribution, revenue/margin/inventory
contribution, discount and price-trend/stability figures, preferred-supplier counts, and
advisory recommendations (high/low performing, price increase warning, consolidation/
diversification opportunity, high margin, review needed) — all COMPOSED from the four
sibling domains' own already-computed intelligence, never recomputed from raw ERP rows.

## 2. Current architecture (as it exists today)

Read in full before any code was written: `docs/architecture/platform-roadmap.md`,
`docs/architecture/business-intelligence.md` (§§1–22 as 12D left them),
`docs/architecture/business-intelligence-api.md` (the full public contract as 12D left
it, including its §13.1 "Supplier Intelligence — reserved" placeholder), all four prior
milestones' design/completion docs, and every file under
`js/services/businessIntelligence/` as 12D left it — in particular
`metrics/supplierMetrics.js` (12B), `aggregators/supplierComparisonAggregator.js`/
`preferredSupplierAggregator.js` (12B), `calculators/discountCalculator.js`/
`priceVolatilityCalculator.js` (12D), and all four sibling domains' own
`api/createXIntelligenceApi(...)` composition roots. Two facts from that reading shaped
this design directly:

1. **This milestone's own brief is stricter than any prior domain's about reuse.**
   Where 12B–12D each said "generalize where possible," 12E's brief states the
   requirement as its own "MOST IMPORTANT ARCHITECTURAL RULE": Supplier Intelligence
   "must COMPOSE existing intelligence... must NOT recreate it," naming Purchase/
   Pricing/Sales/Inventory Intelligence explicitly as what to consume. This changed the
   composition-root design itself (§4 below), not just the calculator/aggregator layer
   every prior milestone's own reuse audit focused on.
2. **`metrics/supplierMetrics.js` (12B) already computes almost every "base fact"
   this milestone needs** — purchase volume, value, average order value, last-purchase
   date, and both raw and annualized purchase frequency, all per supplier. This
   milestone's entire distinguishing value is COMPOSING that with three sibling
   domains' own per-item figures (`metrics/pricingMetrics.js`'s margin %,
   `metrics/salesMetrics.js`'s net sales, `metrics/itemMetrics.js`'s inventory value)
   across each supplier's own item set — not re-deriving any of the four.

## 3. Non-goals (explicit, from the brief)

Not built here: Milestone 12F, a Dashboard UI, any change to Supplier/Purchase/Sales/
Inventory/Pricing/Manufacturing workflow, any database schema change, any API breaking
change, any AI/ML/prediction model. Not implemented: Supplier Lead Time and Supplier
Quality Indicators — both explicitly conditioned in the brief on "only if the ERP stores
it"/"ONLY if supported by ERP," and `schema.sql`'s own `parties` table (§4 below) has no
lead-time, delivery-date, or quality/rating column of any kind; inventing one would
violate the brief's own "Never invent ERP data" rule. Not modified here: any file
Milestones 12A–12D already built, beyond the shared infrastructure/registry files every
prior milestone also extended additively (`shared/config.js`, `index.js`, and the three
registry files) — the cache architecture, the diagnostics integration, the extension
contracts, and every existing shared model are untouched.

## 4. Key design questions answered

**Why does `api/supplierIntelligenceApi.js` have no `loadSnapshot` parameter, unlike
every prior domain's own `createXApi({loadSnapshot, ...})`?** Because this milestone's
own brief requires composing the FOUR sibling domains' own public API instances
(`purchaseIntelligence`, `pricingIntelligence`, `salesIntelligence`,
`inventoryIntelligence`), not a fresh Supabase scan. `createSupplierIntelligenceApi({
purchaseIntel, pricingIntel, salesIntel, inventoryIntel, ...})` injects those four
instead, each defaulting to that domain's own real, shared singleton — full dependency
injection is preserved (tests still run with zero real Supabase calls, via each
sibling's own `createXIntelligenceApi({loadSnapshot: fake})`), just injecting a
different kind of dependency than every prior domain's own factory did.

**Was a `parties`-table query (for supplier name/isActive) needed as a new loader?**
No. `metrics/supplierMetrics.js` (12B) already carries `name`/`isActive` per supplier,
sourced from `purchase/purchaseDataLoader.js`'s own `suppliers` query — reused wholesale
via `purchaseIntel.getPurchaseMetricsSnapshot()`. No new Supabase query exists anywhere
in this domain's own files.

**Why is "purchase_lines grouped by supplierId" a new calculation, when
`purchasesBySupplier` already exists on the `PurchaseSnapshot`?** Because
`purchasesBySupplier` groups whole purchase BILLS by supplier (used by
`metrics/supplierMetrics.js` for purchase-count/value/frequency), not individual
`purchase_line` rows — and per-item price/discount/trend figures needed by this
milestone live on the LINES, not the bills. `metrics/supplierPerformanceMetrics.js`
groups the raw snapshot's own `purchaseLines` by `supplierId` once, itself — the one
genuinely new grouping this milestone needs, still zero new Supabase queries (the lines
were already fetched by `purchaseIntel.getPurchaseMetricsSnapshot()`).

**Why is `calculators/supplierContributionCalculator.js` the only new calculator, when
the brief names five example calculators (`SupplierScoreCalculator`,
`SupplierContributionCalculator`, `SupplierStabilityCalculator`,
`SupplierCostCalculator`, `SupplierLeadTimeCalculator`)?** Because the brief's own
"Calculators" section qualifies those as "Examples," and its own "Mandatory Reuse
Audit" requires generalizing existing code first: cost trend already exists
(`purchaseTrendCalculator.js`, 12B), price stability already exists
(`priceVolatilityCalculator.js`, 12D), and lead time is unsupported by the schema (§3).
Only revenue/margin/inventory CONTRIBUTION — summing already-computed per-item figures
across a supplier's own item set — had no existing calculator, because no prior domain
ever needed to aggregate across a cross-domain-computed item set before.

**Why does `api/supplierIntelligenceApi.js`'s own "Preferred Supplier" logic call
`aggregators/preferredSupplierAggregator.js` (12B) once per item rather than
re-deriving "cheapest supplier" itself?** Because that function already IS the correct,
frozen answer to "who is cheapest for item X" — `aggregators/preferredSupplierCountAggregator.js`
adds ZERO new price-comparison logic, only a tally of an already-computed result across
every item in the snapshot.

**Why is `revenueContribution` allowed to double-count a multi-sourced item across
suppliers, rather than splitting it proportionally?** Because the item genuinely IS
part of each supplying relationship — a supplier who provides 10% of one item's stock
still meaningfully "contributes" to that item's whole revenue story from a supplier-
relationship point of view, and splitting proportionally would require a purchase-share
weighting this milestone's brief never asked for. Disclosed as a deliberate modeling
choice (`docs/architecture/business-intelligence.md` §23.6), not silently left for a
future reader to discover as a suspected bug.

## 5. Testing approach

Same convention as `businessIntelligence.test.html` (12A), `purchaseIntelligence.test.html`
(12B), `salesIntelligence.test.html` (12C), and `pricingIntelligence.test.html` (12D): a
flat, dependency-free `supplierIntelligence.test.html`, no build step, run headlessly via
`python -m http.server` + `chrome --headless=new --dump-dom`. Unlike any prior suite,
this one builds ONE consistent set of items/purchases/sales/inventory fixtures and wires
them into FOUR isolated sibling API instances (`createPurchaseIntelligenceApi`/
`createPricingIntelligenceApi`/`createSalesIntelligenceApi`/`createInventoryIntelligenceApi`,
each with its own fake `loadSnapshot`), then injects those four into
`createSupplierIntelligenceApi({purchaseIntel, pricingIntel, salesIntel, inventoryIntel})`
— fully exercising the composition this milestone's own architectural rule mandates,
with zero real Supabase calls anywhere. The fixture deliberately includes a
multi-sourced item (bought from all three test suppliers, at different prices) to
exercise preferred-supplier tallying, a supplier with a never-sold item (contribution's
null/zero-exclusion path), and a small, rarely-used, never-cheapest supplier (the
consolidation-opportunity recommendation) alongside two larger suppliers (the
diversification-opportunity recommendation) — chosen so the two recommendations are
genuinely distinguishable in one fixture rather than both trivially true. Two real bugs
were caught and fixed during fixture construction, both in the TEST's own hand-computed
expectations, not the implementation: a manual arithmetic error that forgot a third
supplier's contribution to one item's cross-supplier average price, and a cache-leak
between test blocks caused by omitting `cache`/`diagnostics` overrides on the isolated
sibling API instances (both instances defaulted to the same module-level shared
singleton the metrics section above had already warmed, defeating the load-count
assertions). The full existing regression suite (18 prior test files) was re-run after
every change to confirm zero regressions; one pre-existing test (`jobEngine.test.html`'s
hardcoded job-count assertion) required its expected count updated from 7 to 8, the same
correct, disclosed consequence every prior milestone's own new job registration has
required in its turn.

## 6. Reading order for whoever picks this up next

1. `docs/architecture/business-intelligence.md` §23 (the full architecture reference for
   this milestone).
2. `docs/architecture/business-intelligence-api.md` §8 (the full public API contract).
3. `docs/reports/milestone-12E-completion.md` (this milestone's completion report,
   including its own mandatory Reuse Audit).
4. `js/services/businessIntelligence/supplierIntelligence.test.html` (the fixture and
   every check, as executable documentation of every composition/edge case this design
   discusses).
