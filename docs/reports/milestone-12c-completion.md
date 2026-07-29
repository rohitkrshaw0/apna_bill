# Milestone 12C Completion Report — Sales Intelligence Platform

**Branch:** `milestone-12c-sales-intelligence` · **Date:** 2026-07-26

This is a completion report, not a design document. It records what was actually built
and verified for this milestone. For architecture rationale, see
`docs/milestones/milestone-12c-sales-intelligence.md` (design) and
`docs/architecture/business-intelligence.md` §21 (the living reference, not repeated
here). Per this milestone's own explicit instruction, **no commit, merge, or tag has been
made** — this report describes the working tree on its own feature branch, awaiting
approval.

## 1. Architecture Summary

```
ERP (invoices, invoice_lines, parties-as-customers, batches -- read only)
  -> Metrics (metrics/salesMetrics.js, metrics/customerMetrics.js)
  -> Calculators (2 new: revenueCalculator.js, marginCalculator.js;
                  everything else reused VERBATIM from 12A/12B -- see §4)
  -> Aggregators (6 new + 2 thin reuse-wrappers + 2 reused verbatim with no new file -- see §4)
  -> Insight Models (models/salesInsightModels.js)
  -> Business Intelligence Services (api/salesIntelligenceApi.js)
  -> Dashboard / Reports / Extensions (not built by this milestone)
```

Identical pipeline shape to Milestones 12A and 12B — same folders, same `createXApi({
loadSnapshot, cache, diagnostics, recordAudit, resolveActiveCompanyId })` composition-root
shape, same shared `insightCache`/`biDiagnostics` singletons (a third, distinct
`salesMetrics:...` cache-key prefix). Full module map:
`docs/architecture/business-intelligence.md` §21.2.

## 2. Files Added (20)

**Platform code (17)**, all under `js/services/businessIntelligence/`:
- `sales/salesDataLoader.js`
- `metrics/salesMetrics.js`, `metrics/customerMetrics.js`
- `calculators/revenueCalculator.js`, `calculators/marginCalculator.js`
- `aggregators/salesSummaryAggregator.js`, `aggregators/categorySalesSummaryAggregator.js`,
  `aggregators/worstSellingItemsAggregator.js`, `aggregators/seasonalitySummaryAggregator.js`,
  `aggregators/customerRankingAggregator.js`, `aggregators/revenueRankingAggregator.js`,
  `aggregators/salesFrequencySummaryAggregator.js`
- `recommendations/salesRecommendations.js`
- `models/salesInsightModels.js`
- `audit/salesAuditReporter.js`
- `api/salesIntelligenceApi.js`
- `jobs/refreshSalesInsightsJob.js`

**Test (1):** `js/services/businessIntelligence/salesIntelligence.test.html` (90 checks).

**Documentation (2):** `docs/milestones/milestone-12c-sales-intelligence.md`, this report.

## 3. Files Modified (10, all additive per each file's own documented extension mechanism)

- `js/services/events/registry/eventTypes.js` — added `'salesInsight'` to `AGGREGATES`,
  one new entry (`SALES_INSIGHT_GENERATED`) to `EVENT_CONTRACTS`.
- `js/services/audit/registry/auditRegistry.js` — added one entry to
  `AUDIT_RECORD_VERSIONS`.
- `js/services/jobs/registry/jobIds.js` — added one entry (`REFRESH_SALES_INSIGHTS`).
- `js/services/jobs/bootstrap/startBackgroundInfrastructure.js` — one new import, one new
  `jobDispatcher.registerJob(...)` call.
- `js/services/jobs/jobEngine.test.html` — the same pre-existing assertion 12A/12B already
  updated twice (`"...all 5 jobs registered"`) updated to `6`.
- `js/services/businessIntelligence/index.js` — appended new export lines only; every
  existing export line is untouched.
- `js/services/businessIntelligence/shared/config.js` — appended `SALES_DEFAULTS`;
  `MS_PER_DAY`, `DAYS_PER_YEAR`, `DEFAULT_LOOKBACK_DAYS`, `DEFAULT_CACHE_TTL_MS`,
  `MOVEMENT_DEFAULTS`, `REORDER_DEFAULTS`, and `PURCHASE_DEFAULTS` are untouched.
- `docs/architecture/platform-roadmap.md`, `docs/architecture/business-intelligence.md`,
  `docs/architecture/business-intelligence-api.md` — updated per this milestone's own
  documentation instructions; no other section of any of the three altered.

**Zero 12A or 12B files touched** — confirmed by `git diff` against the
`purchase-intelligence-v1.0` tag returning empty for all 12A/12B platform files and every
core ERP file (`js/items.js`, `js/purchases.js`, `js/sales.js`, `js/suppliers.js`,
`schema.sql`).

## 4. Reuse Audit (mandatory, per this milestone's own brief)

### Components reused verbatim (zero modification, called directly)

| Component | Origin | Reused for |
|---|---|---|
| `calculators/categoryCalculator.js` (`resolveCategory`, `groupMetricsByCategory`) | 12A | Item category resolution, category grouping |
| `calculators/turnoverCalculator.js` (`calculateDailySalesVelocity`) | 12A | Sales frequency (transaction count/day) AND sales velocity (units/day) — this function was already named "sales velocity" when 12A built it |
| `calculators/averagePriceCalculator.js` (all 4 functions) | 12B | Average/last/highest/lowest selling price — made possible by `salesDataLoader.js`'s deliberate `billDate` alias |
| `calculators/purchaseTrendCalculator.js` (`calculateRollingPurchaseAverage`, `calculateCostTrend`, `COST_TREND`) | 12B | Rolling average selling price, cost/price trend classification |
| `calculators/purchaseFrequencyCalculator.js` (`annualizePurchaseFrequency`, `calculateAvgDaysBetweenPurchases`) | 12B | Annualizing frequency/velocity, customer purchase cadence |
| `calculators/supplierSpendCalculator.js` (`calculateSupplierSpend`) | 12B | Per-customer order count/value/average |
| `aggregators/purchaseTrendSummaryAggregator.js` (`aggregatePurchaseTrendSummary`) | 12B | Sales Trend Summary — works unmodified because sales metrics deliberately keep the `costTrend` field name |
| `aggregators/topPurchasedItemsAggregator.js` (`aggregateTopPurchasedItems`) | 12B | Top Selling Items AND Top Customers (same generic sort-desc-slice logic, two different metric lists) |
| `cache/insightCache.js` (shared singleton) | 12A | Namespaced with a third, distinct `salesMetrics:...` prefix |
| `diagnostics/biDiagnostics.js` (shared singleton) | 12A | Same one-recorder-for-the-whole-platform reuse |
| `extensions/capabilityNames.js` (all 3 `BI_CAPABILITIES`) | 12A | No new capability needed — none added |
| `shared/config.js` (`MS_PER_DAY`, `DAYS_PER_YEAR`, `DEFAULT_LOOKBACK_DAYS`) | 12A | No new copy of any calendar/default constant |
| `jobs/bootstrap/startBackgroundInfrastructure.js`'s own documented job-registration extension point | 12A/12B | Registered a third job the same way |
| `events/registry/eventTypes.js`/`audit/registry/auditRegistry.js`/`jobs/registry/jobIds.js`'s own documented "add one entry" mechanisms | 12A/12B | Same sanctioned additive pattern, used a third time |

### Components generalized (new, thin delegation files — zero new logic)

| New file | Delegates to | Why a new file was still needed |
|---|---|---|
| `aggregators/customerRankingAggregator.js` | `aggregators/supplierRankingAggregator.js`'s `aggregateSupplierRanking` (100% generic already: `[...list].sort((a,b)=>(b[by]\|\|0)-(a[by]\|\|0))`) | Calling a function literally named "Supplier" ranking for customers would be confusing at a public API call site; renaming the frozen 12B function/file is forbidden |
| `aggregators/revenueRankingAggregator.js` | Same `aggregateSupplierRanking` | Same reasoning, for item revenue ranking |

### New components created (genuinely new logic)

| New file | Why necessary |
|---|---|
| `sales/salesDataLoader.js` | No existing loader reads `invoices`/`invoice_lines`/`parties`-as-customers; new domain, new query shape |
| `calculators/revenueCalculator.js` | No existing calculator distinguishes a document's own `doc_type` (gross/net/returns/return-rate) — Purchase Intelligence has no returns concept at all |
| `calculators/marginCalculator.js` | No existing calculator compares a selling price against a cost basis — 12A's `avgCost` is a stock-valuation figure, never compared to a price |
| `metrics/salesMetrics.js`, `metrics/customerMetrics.js` | New domain's own per-item/per-customer composition (internally almost entirely reused calculators, per above) |
| `aggregators/salesSummaryAggregator.js` | Sums sales-specific field names (`netSales`, `unitsSold`, `grossMargin`) no existing aggregator reads |
| `aggregators/categorySalesSummaryAggregator.js` | `categoryPurchaseSummaryAggregator.js`'s frozen code hardcodes `.purchaseQty`/`.purchaseValue` — cannot be reused for `netSales`/`unitsSold` without modifying a frozen file |
| `aggregators/worstSellingItemsAggregator.js` | `topPurchasedItemsAggregator.js`'s sort direction is fixed descending; inverting it is a different behavior, not an argument |
| `aggregators/seasonalitySummaryAggregator.js` | No existing aggregator buckets by calendar month (12A/12B's own "trend" concept splits a window into two halves, not a monthly series) |
| `aggregators/salesFrequencySummaryAggregator.js` | **The one deliberate exception to this milestone's reuse-heavy design**: `purchaseFrequencySummaryAggregator.js` hardcodes `.purchaseFrequencyPerYear` — reusing it verbatim against `salesFrequencyPerYear`-named metrics would silently return empty results (a wrong answer), not just a naming inconsistency. A ~15-line new file was the honest choice over stretching a frozen function's field-name contract, or misleadingly naming a sales-domain field `purchaseFrequencyPerYear` just to force reuse. |
| `recommendations/salesRecommendations.js` | New domain-specific advisory logic (high demand, declining, requires-attention, customer retention, upsell, cross-sell) — none of this exists in 12A/12B |
| `models/salesInsightModels.js` | New domain's own response shape |
| `audit/salesAuditReporter.js` | Publishes a new, additive event type specific to this domain |
| `api/salesIntelligenceApi.js` | New domain's own composition root (reuses the identical DI shape 12A/12B established) |
| `jobs/refreshSalesInsightsJob.js` | New domain's own cache-warming job, registered through the existing, unmodified Job Engine |
| `shared/config.js`'s `SALES_DEFAULTS` | Sales-specific thresholds (`highDemandSalesPerYear`, `lowPerformingSalesPerYear`, `retentionGapMultiplier`, `upsellBelowCompanyAvgPct`) — `PURCHASE_DEFAULTS`' own `trendThresholdPct`/`rollingAverageWindow` values are reused (not duplicated) for the two thresholds genuinely shared with the reused trend/rolling-average calculators |

## 5. New Metrics

Per item (`metrics/salesMetrics.js`): `grossSales`, `returnsValue`, `netSales`/`revenue`,
`unitsSold` (net of returns), `returnRate`, `avgSellingPrice`, `lastSellingPrice`,
`highestSellingPrice`, `lowestSellingPrice`, `rollingAvgSellingPrice`, `lastSaleDate`,
`daysSinceLastSale`, `salesFrequency`/`salesFrequencyPerYear`,
`salesVelocity`/`salesVelocityPerYear`, `costTrend`/`costTrendChangePct`,
`marginableRevenue`/`grossMargin`/`grossMarginPct`, `category`. Per customer
(`metrics/customerMetrics.js`): `orderCount`, `totalSalesValue`, `avgOrderValue`,
`lastSaleDate`, `daysSinceLastSale`, `avgDaysBetweenPurchases`,
`salesFrequency`/`salesFrequencyPerYear`, `categories` (distinct categories purchased —
used only for the cross-sell recommendation).

## 6. New Calculators

`calculateGrossSales`, `calculateReturnsValue`, `calculateNetSales`,
`calculateNetUnitsSold`, `calculateReturnRate` (`revenueCalculator.js`);
`calculateGrossMargin` (`marginCalculator.js`). Every other price/trend/frequency/spend
calculation reuses an existing 12A/12B calculator verbatim — see §4.

## 7. New Aggregators

`aggregateSalesSummary`, `aggregateCategorySalesSummary`, `aggregateWorstSellingItems`,
`aggregateSeasonalitySummary`, `aggregateSalesFrequencySummary` (genuinely new logic);
`aggregateCustomerRanking`, `aggregateRevenueRanking` (thin delegating wrappers). "Top
Selling Items", "Top Customers", and "Sales Trend Summary" are served by 12B's own
aggregators, reused with no new file at all — see §4.

## 8. Public APIs

`salesIntelligence.{getSalesSummary, getRevenueSummary, getSalesTrends,
getTopSellingItems, getWorstSellingItems, getCustomerRanking, getCategoryPerformance,
getSalesRecommendations, getTopCustomers, getSeasonality, getRevenueRanking,
generateSalesInsightReport}`, plus `createSalesIntelligenceApi(deps)` for isolated/test
instances. Fully documented, function-by-function, in
`docs/architecture/business-intelligence-api.md` §6 (new).

## 9. Regression Results

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
| `jobs/jobEngine.test.html` | 54/54 ✅ (updated: 5→6 registered jobs, §3) |
| `ui/forms/forms.test.html` | 80/80 ✅ |
| `businessIntelligence/businessIntelligence.test.html` (12A, unmodified) | 128/128 ✅ |
| `businessIntelligence/purchaseIntelligence.test.html` (12B, unmodified) | 95/95 ✅ |
| `businessIntelligence/salesIntelligence.test.html` (new) | 90/90 ✅ |
| **Total** | **1175/1175 ✅** |

Additionally verified: `git diff --stat purchase-intelligence-v1.0 -- <every 12A/12B file
+ every core ERP file>` returned empty (zero bytes changed); the same programmatic
dependency-cycle-detection script 12A/12B's own verification passes used was re-run: 123
files, 327 edges, zero cycles, exactly three sanctioned job-registration reverse edges
into `businessIntelligence/` and none other; a repository-wide grep confirmed zero UI
imports in any production Sales Intelligence file and zero ERP/UI files reference the new
sales code.

## 10. Performance Notes

- `sales/salesDataLoader.js` runs exactly four queries per snapshot (invoices, customers
  in parallel; invoice_lines scoped to the returned invoice ids; batches scoped only to
  the batch ids actually referenced, skipped entirely if none) — never one query per item,
  never one query per insight.
- The `{snapshot, salesMetrics, customerMetrics}` bundle is cached for
  `DEFAULT_CACHE_TTL_MS` (5 minutes, shared with Inventory and Purchase Intelligence) per
  `{companyId, lookbackDays}`.
- `aggregateSalesSummary` composes `aggregatePurchaseTrendSummary` and
  `aggregateSalesFrequencySummary`'s own outputs rather than re-filtering `salesMetrics` a
  third time.
- `refreshSalesInsightsJob` invalidates only the affected company's cache entries.

## 11. Risks

None that block this milestone. Two shared-cache/shared-trigger interactions worth naming
(same category as 12B's own disclosed interaction, harmless and arguably correct): (1)
`SaleCreated` and `CustomerCreated` now trigger `refreshSalesInsightsJob` alongside
whatever else already listened; (2) `aggregateSalesFrequencySummary`'s deliberate
non-reuse of `purchaseFrequencySummaryAggregator.js` (§4) means the two frequency-summary
aggregators (`purchaseFrequencySummaryAggregator.js`, `salesFrequencySummaryAggregator.js`)
are now near-identical in shape but not literally shared code — a future milestone
touching one should remember to check the other, though neither can be merged without
either renaming a frozen field or misleadingly renaming a domain-specific one.

## 12. Technical Debt (disclosed, none blocking)

- Return-rate metrics read as `0`/`null` for every real company today, since no workflow
  in this ERP writes a `sale_return` row (same disclosed limitation `purchase_lines`'
  own docType handling already has for purchase returns).
- Gross margin is computable only for lines with a resolvable batch cost — the same
  non-batch-tracked-item limitation 12A's own COGS calculation discloses.
- The cross-sell/upsell heuristics are simple, deterministic set-difference/threshold
  comparisons, not a market-basket or ML-style recommendation — deliberately, matching
  this platform's "deterministic calculation, not statistics/ML" scope throughout.
- No automated test harness exists for `sales/salesDataLoader.js`'s own four Supabase
  queries — reviewed by inspection, the same disclosed limitation every other
  Supabase-touching file in this platform already has.
- No Dashboard UI consumes any Business Intelligence domain yet — by design, out of
  scope for 12A/12B/12C alike.

## 13. Merge Readiness

**Ready for review.** All success criteria from this milestone's own brief are met:
existing ERP behavior, Inventory Intelligence, and Purchase Intelligence are all
byte-for-byte unchanged (confirmed by `git diff` against the `purchase-intelligence-v1.0`
tag); no duplicated business logic exists (§4's Reuse Audit); Sales Intelligence fully
reuses the BI platform's own architecture, cache, diagnostics, job engine, and audit
platform; no infrastructure or schema change was required; no API contract was broken
(only additive functions/models/fields); Business Intelligence remains completely
read-only; the full regression suite passes (1175/1175); documentation is complete
(`business-intelligence.md` §21, `business-intelligence-api.md` §6 + updated versioning
table, `platform-roadmap.md`, this report, and the milestone design doc).

**Per this milestone's own explicit instruction: no commit, merge, or tag has been made.**
The working tree sits on branch `milestone-12c-sales-intelligence`, awaiting approval
before any of those three actions are taken.
