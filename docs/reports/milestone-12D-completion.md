# Milestone 12D Completion Report — Pricing Intelligence Platform

## 1. Architecture Summary

Pricing Intelligence is the fourth domain added to the existing, unmodified Business
Intelligence pipeline (`ERP → Metrics → Calculators → Aggregators → Insight Models →
Business Intelligence APIs → Consumers`). It reuses Purchase Intelligence's (12B) and
Sales Intelligence's (12C) own already-computed per-item price series — reusing both
domains' data loaders and metrics functions wholesale, not re-scanning either — and joins
them into margin %, markup %, price difference, price stability/volatility, and discount
analysis, plus deterministic advisory recommendations. No parallel pipeline was
introduced: `pricing/pricingDataLoader.js` composes `loadPurchaseSnapshot()`/
`loadSalesSnapshot()` (both frozen, called verbatim) and adds exactly one new query
(`items`, for each item's current/master prices). Every percentage this domain computes
(margin %, markup %, discount %) routes through one new, single shared calculator
(`calculators/percentageCalculator.js`), per this milestone's own added architectural
rule. The platform is READ ONLY and ADVISORY ONLY: no function here writes to `items`,
`purchases`, `purchase_lines`, `invoices`, `invoice_lines`, or any other ERP table; the
only side effect any function has is one opt-in Audit Platform entry via
`generatePricingInsightReport()`, identical in shape to every prior domain's own
`generateXInsightReport()`.

## 2. Reuse Audit (mandatory, per this milestone's own brief)

### Components reused verbatim (zero modification, called directly)

- `calculators/averagePriceCalculator.js` — avg/last/highest/lowest price, both sides (12B)
- `calculators/purchaseTrendCalculator.js` — `COST_TREND`, `calculateCostTrend`, `calculateRollingPurchaseAverage` (12B)
- `calculators/categoryCalculator.js` — `resolveCategory`, `groupMetricsByCategory` (12A)
- `metrics/salesMetrics.js`'s `computeSalesMetrics` (12C)
- `metrics/purchaseMetrics.js`'s `computePurchaseMetrics` (12B)
- `sales/salesDataLoader.js`'s `loadSalesSnapshot` (12C)
- `purchase/purchaseDataLoader.js`'s `loadPurchaseSnapshot` (12B)
- `aggregators/topPurchasedItemsAggregator.js` (12B) — for Highest Margin Items and Most Discounted Items
- `aggregators/worstSellingItemsAggregator.js` (12C) — for Lowest Margin Items
- `aggregators/costHistoryAggregator.js` (12B) — for purchase-side price history
- `cache/insightCache.js`, `diagnostics/biDiagnostics.js`, `shared/freezeDeep.js`
- `extensions/capabilityNames.js`'s three existing `BI_CAPABILITIES` — no new capability was needed

### Components generalized (new, thin delegation files — zero new logic)

- `aggregators/priceTrendSummaryAggregator.js` — a one-line delegate to
  `purchaseTrendSummaryAggregator.js` (12B, frozen) via a `sellingPriceTrend` →
  `costTrend` field remap, the same pattern `aggregators/customerRankingAggregator.js`
  (12C) established for `supplierRankingAggregator.js`.

### New components created (genuinely new logic), and justification for each

| File | Justification |
|---|---|
| `calculators/percentageCalculator.js` | The mandatory single shared ratio formula this milestone's brief adds — no prior domain needed one shared entry point serving multiple independently-computed percentages. |
| `calculators/pricingCalculator.js` | No existing calculator compares a selling price against a purchase price; 12C's own margin figure is revenue-based (batch cost vs. actual line revenue), not price-point-based. |
| `calculators/discountCalculator.js` | No existing calculator reads `discount_pct`/`discount_amt` — unread by this platform before this milestone. |
| `calculators/priceVolatilityCalculator.js` | No existing calculator measures price dispersion — `costTrend` classifies direction, a different question. |
| `pricing/pricingDataLoader.js` | No prior domain needed two other domains' snapshots joined at once; composes rather than duplicates. |
| `metrics/pricingMetrics.js` | The sell-vs-buy per-item join — the domain's core new value. |
| `aggregators/pricingSummaryAggregator.js` | Company-wide totals composition, mirroring `salesSummaryAggregator.js`'s own role. |
| `aggregators/categoryPricingSummaryAggregator.js` | Reduces over this domain's own field names (`marginPct`/`markupPct`), which no frozen category aggregator can be changed to accommodate. |
| `aggregators/marginThresholdAggregator.js` | A predicate classification against a configurable target, not a sort — no existing aggregator does this. |
| `aggregators/discountSummaryAggregator.js` | Company-wide discount rollup over this domain's own fields. |
| `aggregators/sellingPriceHistoryAggregator.js` | Mirrors `costHistoryAggregator.js`'s shape but cannot reuse it verbatim — different snapshot field names (`invoiceId`/`partyId` vs. `purchaseId`/`supplierId`). |
| `recommendations/pricingRecommendations.js` | New deterministic threshold checks over this domain's own metric fields. |
| `models/pricingInsightModels.js` | Pure assembly + deep-freeze of this domain's own pieces. |
| `audit/pricingAuditReporter.js` | One new, narrow bridge publishing one new, additive event type. |
| `api/pricingIntelligenceApi.js` | The composition root for this domain. |
| `jobs/refreshPricingInsightsJob.js` | Cache-warming job triggered by either side's transactions. |

### A real correctness gap found and fixed during this reuse audit

`aggregateTopPurchasedItems`/`aggregateWorstSellingItems` (both reused verbatim, frozen)
sort via `a[by] || 0` — correct when a metric is genuinely absent-as-zero, but a `null`
`marginPct`/`avgDiscountPct` means "no price-point to compare" (never sold, or never
purchased), not "zero margin/discount". Passing the full metrics list straight through
would have silently ranked "no pricing data" items as the worst performers. Fixed by
filtering to items with a non-null value in `api/pricingIntelligenceApi.js` before
calling either frozen aggregator for any margin/discount ranking — the aggregators
themselves were correctly left unmodified; the filter lives in the one place that knows
what `null` means for this domain. Caught and fixed during fixture design for the test
suite, before any test was written against the bug.

## 3. Files Added (19, plus this report and its own milestone design doc = 21)

```
js/services/businessIntelligence/calculators/percentageCalculator.js
js/services/businessIntelligence/calculators/pricingCalculator.js
js/services/businessIntelligence/calculators/discountCalculator.js
js/services/businessIntelligence/calculators/priceVolatilityCalculator.js
js/services/businessIntelligence/pricing/pricingDataLoader.js
js/services/businessIntelligence/metrics/pricingMetrics.js
js/services/businessIntelligence/aggregators/pricingSummaryAggregator.js
js/services/businessIntelligence/aggregators/categoryPricingSummaryAggregator.js
js/services/businessIntelligence/aggregators/marginThresholdAggregator.js
js/services/businessIntelligence/aggregators/priceTrendSummaryAggregator.js
js/services/businessIntelligence/aggregators/discountSummaryAggregator.js
js/services/businessIntelligence/aggregators/sellingPriceHistoryAggregator.js
js/services/businessIntelligence/recommendations/pricingRecommendations.js
js/services/businessIntelligence/models/pricingInsightModels.js
js/services/businessIntelligence/audit/pricingAuditReporter.js
js/services/businessIntelligence/api/pricingIntelligenceApi.js
js/services/businessIntelligence/jobs/refreshPricingInsightsJob.js
js/services/businessIntelligence/pricingIntelligence.test.html
docs/milestones/milestone-12D-pricing-intelligence.md
docs/reports/milestone-12D-completion.md   (this file)
```

## 4. Files Modified (12, all additive per each file's own documented extension mechanism)

```
js/services/businessIntelligence/shared/config.js               (+PRICING_DEFAULTS block)
js/services/businessIntelligence/index.js                        (+Milestone 12D export block)
js/services/businessIntelligence/purchase/purchaseDataLoader.js  (+discount_pct/discount_amt columns, additive)
js/services/businessIntelligence/sales/salesDataLoader.js        (+discount_pct/discount_amt columns, additive)
js/services/events/registry/eventTypes.js                        (+'pricingInsight' aggregate, +PRICING_INSIGHT_GENERATED)
js/services/audit/registry/auditRegistry.js                      (+PRICING_INSIGHT_GENERATED entry)
js/services/jobs/registry/jobIds.js                               (+REFRESH_PRICING_INSIGHTS)
js/services/jobs/bootstrap/startBackgroundInfrastructure.js       (+createRefreshPricingInsightsJob registration)
js/services/jobs/jobEngine.test.html                              (job-count assertion updated 6 -> 7, see §7)
docs/architecture/business-intelligence.md                       (+§22 Pricing Intelligence)
docs/architecture/business-intelligence-api.md                    (+§7 Pricing Intelligence APIs, renumbered §§8-12)
docs/architecture/platform-roadmap.md                             (+12D in-progress paragraph only, per explicit review-scope instruction -- no completed-milestone/checkpoint/tag state changed)
```

No file belonging to Milestones 1–11F, 12A, 12B, or 12C's own domain logic was modified
beyond the two disclosed, additive loader extensions above and the shared
infrastructure/registry files every prior milestone also extended the same way.

## 5. New Metrics

`metrics/pricingMetrics.js`'s `computePricingMetrics()` — one row per item known to the
items table, a sale, or a purchase within the window: current/average/highest/lowest
selling and purchase price, price difference, margin %, markup %, gross margin (reused
from 12C), average/maximum discount %, discount frequency %, selling/purchase price
volatility %, price stability classification, selling/purchase price trend, sales
frequency. Full field list: `docs/architecture/business-intelligence-api.md` §8
(`PricingMetric`).

## 6. New Calculators

- `calculators/percentageCalculator.js` — `calculatePercentage(numerator, denominator)`, the mandatory single shared ratio formula.
- `calculators/pricingCalculator.js` — `calculatePriceDifference`, `calculateMarginPct`, `calculateMarkupPct`.
- `calculators/discountCalculator.js` — `calculateAverageDiscountPct`, `calculateMaxDiscountPct`, `calculateDiscountFrequency`.
- `calculators/priceVolatilityCalculator.js` — `calculatePriceVolatility`, `classifyPriceStability`, `PRICE_STABILITY`.

## 7. New Aggregators

- `aggregators/pricingSummaryAggregator.js` — `aggregatePricingSummary`
- `aggregators/categoryPricingSummaryAggregator.js` — `aggregateCategoryPricingSummary`
- `aggregators/marginThresholdAggregator.js` — `aggregateMarginThreshold`
- `aggregators/priceTrendSummaryAggregator.js` — `aggregatePriceTrendSummary` (thin delegate)
- `aggregators/discountSummaryAggregator.js` — `aggregateDiscountSummary`
- `aggregators/sellingPriceHistoryAggregator.js` — `aggregateSellingPriceHistory`

## 8. New Recommendation Services

`recommendations/pricingRecommendations.js` — `buildPricingRecommendation`/
`buildPricingRecommendations`, one deterministic advisory row per item:
`lowMarginWarning`, `highDiscountWarning`, `priceIncreaseOpportunity`,
`priceReductionOpportunity`, `priceConsistencyWarning`, `supplierCostIncreaseAlert`. No
AI, no machine learning, no prediction model — every flag is a threshold check against
already-computed `PricingMetric` fields (`PRICING_DEFAULTS`, with one deliberate
cross-domain reuse of `SALES_DEFAULTS.lowPerformingSalesPerYear` for the "rarely sold"
half of `priceReductionOpportunity`, the same reuse precedent `SALES_DEFAULTS` itself
documents for `PURCHASE_DEFAULTS`).

## 9. Public APIs

`pricingIntelligence`/`createPricingIntelligenceApi` (`api/pricingIntelligenceApi.js`):
`getPricingMetricsSnapshot`, `getPricingSummary`, `getMarginAnalysis`,
`getMarkupAnalysis`, `getPriceHistory`, `getPriceTrends`, `getDiscountAnalysis`,
`getHighestMarginItems`, `getLowestMarginItems`, `getCategoryPricing`,
`getPricingRecommendations`, `generatePricingInsightReport`. Full function-by-function
contract: `docs/architecture/business-intelligence-api.md` §7 (which also moves the
platform's version table from `v1.3 (reserved)` to `v1.3` delivered, and folds the old
§11.1 "Pricing Intelligence — reserved" placeholder into the now-real API).

## 10. Regression Results

Full existing regression suite (17 `.test.html` files spanning every platform:
forms, Data Exchange, migration, Event Bus, JSON import/export, XML import/export,
`.apnabill` backup/restore, Diagnostics, Audit, Extension Framework, Job Engine, and all
four Business Intelligence domains) re-run headlessly (`python -m http.server` +
`chrome --headless=new --dump-dom`) after every implementation change:

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
pricingIntelligence.test.html (12D, new) ........ 80/80 passed
jobEngine.test.html ............................. 54/54 passed (after the one required update below)
```

**One pre-existing test required an update, not a rollback**: `jobEngine.test.html`
hardcoded "`startBackgroundInfrastructure: returns a running dispatcher with all 6 jobs
registered`" (`dispatcher.registry.list().length === 6`). Registering
`refreshPricingInsightsJob` (this milestone's own, correct, documented extension-point
usage) makes that count 7. Updated the assertion and its adjacent comment to 7 — this is
the exact same, expected update 12A/12B/12C's own additions to this same test each
required in their turn (the file's own comment trail shows the count was 3 → ... → 6
before this milestone, now 7).

**Inventory Intelligence (12A), Purchase Intelligence (12B), and Sales Intelligence
(12C) are unchanged**: confirmed by their own test suites passing unmodified (128/128,
95/95, 90/90) and by `git diff` showing zero changes to any of their own calculator/
aggregator/metric/model/recommendation/API files — the only touches to their domains at
all are the two disclosed, additive `discount_pct`/`discount_amt` column additions to
their data loaders. **ERP is unchanged**: no `schema.sql` change, no `js/items.js`/
`js/purchase.js`/`js/sales.js`/`js/inventory.js` change (confirmed by `git status`
showing none of them touched).

## 11. Performance Notes

One pricing scan powers every insight in this domain, the same "one scan, many insights"
seam every prior domain established — taken one level further here: the scan itself is a
composition of two already-existing scans (`loadPurchaseSnapshot`/`loadSalesSnapshot`)
plus one small, new addition (one `items` query for current prices), not a fresh scan.
`computePricingMetrics()` runs `computeSalesMetrics()`/`computePurchaseMetrics()` exactly
once per call (via `getPricingMetricsSnapshot()`'s own cache-checked composition step,
identical shape to every prior domain's own snapshot function) and every aggregator/
recommendation downstream reads that same array — O(n) over items, no repeated
per-item queries, no nested scans. The one additive change to `purchase/purchaseDataLoader.js`/
`sales/salesDataLoader.js` (two more `SELECT` columns each) adds zero additional queries;
it was specifically chosen over a second, independent discount-focused query against
either table to honor this milestone's own "avoid repeated database queries" rule. Cache
reuse (`pricingMetrics:${lookbackDays}` key, same shared `insightCache` singleton) and
diagnostics reuse (same shared `biDiagnostics` instance, one `bi:<functionName>` timeline
entry per call) are both wired identically to every prior domain — no new cache
implementation, no new diagnostics framework, per the milestone's own explicit rules.

## 12. Risks

- **Discount analysis is sell-side only.** `PricingMetric`'s `avgDiscountPct`/
  `maxDiscountPct`/`discountFrequencyPct` are computed from sale lines only (the
  customer-facing discount), not purchase-line discounts (a supplier-facing discount,
  also now read from `purchase_lines.discount_pct`/`discount_amt` but not yet surfaced
  as its own metric). This was a deliberate scope decision, not an oversight — "Average
  Discount" reads most naturally as a customer-facing figure, and the brief's own
  examples (`Discount Analysis`, `Average Discount`, `Maximum Discount`, `Discount
  Frequency`) are agnostic on which side. A future milestone can add
  `avgPurchaseDiscountPct` etc. with zero new query (the columns are already read)
  purely additively.
- **`currentSellingPrice`/`currentPurchasePrice` read `items.default_retail_price`/
  `default_purchase_price`, not `batches.mrp`/`retail_price`/`wholesale_price`.** For a
  batch-tracked item whose batches carry their own, different retail/wholesale/MRP
  values, "current price" as reported here is the item master's default, not the
  currently-active batch's own price. Disclosed, not fixed in this milestone — reading
  batch-level current prices would require a new query this milestone's own loader does
  not currently run (`batches` is not queried by `pricing/pricingDataLoader.js`), and
  the brief's own examples ("Current Selling Price", "Current Purchase Price") are
  satisfied by the item-level figure without inventing new data.
- **Price volatility/stability is computed from selling-side rate history only**
  (`sellingPriceVolatilityPct` drives `priceStability`); `purchasePriceVolatilityPct` is
  computed and exposed on `PricingMetric` but does not independently drive a
  classification field. This mirrors the brief's own emphasis (advisory recommendations
  reference "Price Consistency Warning" as a single, sell-side-facing signal) and keeps
  the recommendation model simple; a future milestone could add a parallel
  `purchasePriceStability` classification with zero new calculation (the volatility
  number already exists).

## 13. Technical Debt (disclosed, none blocking)

- `getCategoryPricing()`'s underlying aggregator averages `marginPct`/`markupPct` per
  category using a simple (unweighted) mean across items, not a revenue-weighted
  average. Consistent with `categorySalesSummaryAggregator.js`'s own `avgSellingPrice`
  computation style (weighted by units there, but this domain has no natural single
  weighting unit across margin/markup), and disclosed here rather than silently chosen.
- `calculators/discountCalculator.js`'s effective-discount fallback
  (`calculatePercentage(discountAmt, taxableValue + discountAmt)`) assumes
  `taxableValue` already reflects the discounted amount (matching this schema's own
  `purchase_lines`/`invoice_lines` column semantics, confirmed against `schema.sql`) —
  documented in the calculator's own header comment, not re-derived from first
  principles per call site.

## 14. Merge Readiness

Architecturally complete and internally consistent: reuses the frozen pipeline exactly
(`ERP → Metrics → Calculators → Aggregators → Insight Models → APIs → Consumers`, §1),
introduces zero parallel pipeline, zero schema change, zero workflow change, zero API
breaking change. Full regression suite green (17/17 test files, 1,275 total checks
passing across the whole repository as of this report). Documentation complete:
`docs/architecture/business-intelligence.md` §22, `docs/architecture/business-intelligence-api.md`
§7 (plus the renumbering of §§8–12 and the version-table update this necessitated),
`docs/milestones/milestone-12D-pricing-intelligence.md`, and this report.
`docs/architecture/platform-roadmap.md` was updated with an in-progress-only paragraph
per explicit review-scope instruction — its Completed Milestones table, Current
Repository Status, and Repository Checkpoints table are deliberately untouched pending
approval.

**Per this milestone's own explicit brief and the reviewer's own standing instruction:
STOP here. Do not commit, merge, tag, or push. This branch
(`milestone-12d-pricing-intelligence`) remains uncommitted, awaiting architecture
review — the same state 12C was left in before its own, separate review and commit.**
