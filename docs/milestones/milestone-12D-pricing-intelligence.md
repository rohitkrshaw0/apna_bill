# Milestone 12D — Pricing Intelligence Platform: Design

## 1. Goals

Extend the Business Intelligence platform (Milestones 12A/12B/12C) with a fourth,
read-only, advisory-only domain: Pricing Intelligence. Current/average/historical/
highest/lowest selling and purchase price, price difference, margin %, markup %, gross
margin, price stability/volatility, average/maximum discount and discount frequency,
price trend, category pricing, and advisory recommendations (low margin, high discount,
price increase/reduction opportunity, price consistency, supplier cost increase) — all
deterministic calculations over pricing data the ERP already stores, none of it
requiring a new query pattern the platform hasn't already established.

## 2. Current architecture (as it exists today)

Read in full before any code was written: `docs/architecture/platform-roadmap.md`,
`docs/architecture/business-intelligence.md` (§§1–21 as 12C left them),
`docs/architecture/business-intelligence-api.md` (the full public contract as 12C left
it, including its §11.1 "Pricing Intelligence — reserved, not implemented" placeholder),
all three prior milestones' design/completion docs, and every file under
`js/services/businessIntelligence/` as 12C left it — in particular
`calculators/marginCalculator.js`, `calculators/revenueCalculator.js`,
`calculators/averagePriceCalculator.js`, `calculators/purchaseTrendCalculator.js`,
`metrics/salesMetrics.js`, `metrics/purchaseMetrics.js`, and both domains' own data
loaders. Three facts from that reading shaped this design directly:

1. **`metrics/salesMetrics.js` and `metrics/purchaseMetrics.js` already compute nearly
   every raw price statistic this milestone needs** — average/last/highest/lowest
   selling price and average/last/highest/lowest purchase price, both per item, both
   already qty-weighted via `calculators/averagePriceCalculator.js`. This milestone's
   entire distinguishing value is *joining* those two, already-computed, independently-
   scanned series per item — not re-deriving either one.
2. **`purchase_lines`/`invoice_lines` already carry `discount_pct`/`discount_amt`
   columns in `schema.sql`, unread by any BI loader before this milestone.** Discount
   analysis was possible from day one of the schema; it simply required extending two
   existing `.select()` calls by two columns each — additive, not a schema change.
3. **This milestone's own brief adds one internal rule beyond every prior domain's**:
   every percentage (margin %, markup %, discount %) must come from a single shared
   calculator, to prevent the three-different-people-three-different-formulas failure
   mode a "percentage" is unusually easy to fall into. This shaped the calculator layer
   before anything else was designed — `calculators/percentageCalculator.js` was written
   first, and every other new calculator was written to depend on it, not the reverse.

## 3. Non-goals (explicit, from the brief)

Not built here: Milestone 12E (Supplier Intelligence) or 12F (Business Dashboard), a
Dashboard UI, any change to Item/Purchase/Sales/Inventory/Manufacturing workflow, any
database schema change (both new columns read, `discount_pct`/`discount_amt`, already
existed), any API breaking change, any AI/ML/prediction model (every recommendation is a
deterministic threshold check). Not modified here: any file Milestones 12A/12B/12C
already built beyond two small, additive, disclosed extensions
(`purchase/purchaseDataLoader.js`, `sales/salesDataLoader.js` — two new `SELECT` columns
each, zero existing fields changed) — the cache architecture, the diagnostics
integration, the extension contracts, and every existing shared model are untouched;
this milestone adds new, additive fields and new, additive models, never renames or
removes an existing one.

## 4. Key design questions answered

**Why does Pricing Intelligence need its own data loader (`pricing/pricingDataLoader.js`)
when every prior domain's loader is "the only file that touches Supabase" for its own
domain?** Because Pricing Intelligence is the first domain that genuinely needs BOTH
sell-side and buy-side data at once. Rather than duplicating either domain's queries
(which would violate this milestone's own "avoid repeated database queries" rule), this
loader *composes* `loadPurchaseSnapshot()`/`loadSalesSnapshot()` (12B/12C, both frozen,
both called verbatim) and adds exactly one new query of its own (`items`, for
current/master prices neither existing snapshot loads).

**Why extend `purchase/purchaseDataLoader.js`/`sales/salesDataLoader.js` at all, given
every prior milestone's own comments describe the previous milestone's loader as
"frozen, unmodified"?** Because the alternative — a second, independent query against
`purchase_lines`/`invoice_lines` just to read two more columns already present on rows
already being fetched — is a real, avoidable duplicate query, and this platform has an
established precedent for additive-only extension of shared/infrastructure files
(`shared/config.js`, `index.js`, and all three registry files are extended by every
milestone). "Frozen" has always meant "no existing field, query shape, or return value
changes" (confirmed true here), not "the file may never gain a new, additive column."

**Why is there no `marginCalculator.js` reuse for this milestone's own margin %?**
Because 12C's `calculateGrossMargin()` computes a genuinely different figure —
transaction-level, revenue-based margin from a batch cost basis — not the same
computation as this domain's price-point margin % (average/current selling price vs.
average/current purchase price). `metrics/pricingMetrics.js` carries 12C's
`grossMargin`/`grossMarginPct` through unmodified, alongside its own, distinct
`marginPct`/`markupPct` — two legitimate, different margin figures on the same row,
never conflated, and never force-reused into one calculator that would blur the
distinction.

**Why does `aggregators/priceTrendSummaryAggregator.js` exist as a one-line delegate
instead of a consumer bucketing by `sellingPriceTrend` directly?** Because
`aggregators/purchaseTrendSummaryAggregator.js` (12B, frozen) hardcodes the field name
`costTrend`, and this milestone's own `PricingMetric` row needs two distinctly-named
trend fields (`sellingPriceTrend`/`purchasePriceTrend`, since both sides are present on
the same row, unlike any prior domain) — the same "generalize by composition, one
field-name remap, zero new bucketing logic" pattern
`aggregators/customerRankingAggregator.js` (12C) already established.

**Why filter out null-margin items before calling `aggregateTopPurchasedItems`/
`aggregateWorstSellingItems` for margin rankings, rather than reusing them exactly as
12C did for revenue rankings?** Because those two frozen aggregators sort via
`a[by] || 0` — correct when a metric is genuinely absent-as-zero (no prior domain has a
metric that's legitimately absent, only ever zero-or-a-number), but a `null` `marginPct`
means "never sold, or never purchased — no price-point to compare," and treating it as a
0% margin would silently rank "no data" items as the worst performers. This is a real
correctness issue this milestone's own reuse audit surfaced and fixed at the API layer
(where the meaning of `null` for this domain is known), not by modifying either frozen
aggregator.

## 5. Testing approach

Same convention as `businessIntelligence.test.html` (12A), `purchaseIntelligence.test.html`
(12B), and `salesIntelligence.test.html` (12C): a flat, dependency-free
`pricingIntelligence.test.html`, no build step, run headlessly via
`python -m http.server` + `chrome --headless=new --dump-dom`. A hand-built, deterministic
fixture (an `items` array plus a `PurchaseSnapshot` and a `SalesSnapshot`, matching
exactly what `loadPricingSnapshot()` itself assembles) drives every calculator/metric/
aggregator/recommendation/model/API/job check via the API layer's own
dependency-injection seam — `pricing/pricingDataLoader.js`'s own Supabase queries (and
the two it delegates to) are never exercised directly. The fixture deliberately includes
edge-case items with no purchase history, no sales history, and a batch-cost-resolvable
sale with no purchase history at all, specifically to exercise every `null`-handling path
the Key Design Questions above identify. The full existing regression suite (17 test
files, all prior milestones) was re-run after every change to confirm zero regressions;
one pre-existing test (`jobEngine.test.html`'s hardcoded "6 jobs registered" assertion)
required an expected update to "7", since this milestone registers a genuinely new job —
not a regression, a correct, disclosed consequence of this milestone's own scope.

## 6. Reading order for whoever picks this up next

1. `docs/architecture/business-intelligence.md` §22 (the full architecture reference for
   this milestone).
2. `docs/architecture/business-intelligence-api.md` §7 (the full public API contract).
3. `docs/reports/milestone-12D-completion.md` (this milestone's completion report,
   including its own mandatory Reuse Audit).
4. `js/services/businessIntelligence/pricingIntelligence.test.html` (the fixture and
   every check, as executable documentation of every field/edge case this design
   discusses).
