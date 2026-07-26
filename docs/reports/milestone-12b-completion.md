# Milestone 12B Completion Report — Purchase Intelligence Platform

**Branch:** `milestone-12` · **Date:** 2026-07-26

This is a completion report, not a design document. It records what was actually built
and verified for this milestone. For architecture rationale, see
`docs/milestones/milestone-12b-purchase-intelligence.md` (design) and
`docs/architecture/business-intelligence.md` §20 (the living reference, not repeated
here). Like the 12A completion report, this one does not claim a git tag, merge, or push
— none were made as part of writing this report.

## Summary

Milestone 12B extends `js/services/businessIntelligence/` (built in Milestone 12A) with a
second, read-only domain: Purchase Intelligence. No database schema change, no change to
any existing ERP business logic (`js/purchases.js`, `js/suppliers.js`, `schema.sql` are
byte-for-byte unchanged, confirmed by `git diff`), no change to any file Milestone 12A
built (also confirmed by `git diff` against the `inventory-intelligence-v1.0` tag — every
12A file matches exactly), and no Dashboard UI. Three existing platform registries were
extended using their own documented, additive "add one entry" mechanisms
(`events/registry/eventTypes.js`, `audit/registry/auditRegistry.js`,
`jobs/registry/jobIds.js`), plus one line added to
`jobs/bootstrap/startBackgroundInfrastructure.js` and one pre-existing test assertion
updated (the same disclosed pattern 12A itself used). Full regression: **1085/1085
passing** across 16 suites (862 carried over from before 12A, unmodified + 128 from 12A,
unmodified + 95 new).

## 1. Architecture Summary

```
ERP (purchases, purchase_lines, parties -- read only)
  -> Metrics (metrics/purchaseMetrics.js, metrics/supplierMetrics.js)
  -> Calculators (calculators/averagePriceCalculator.js, purchaseTrendCalculator.js,
                  purchaseFrequencyCalculator.js, supplierSpendCalculator.js)
  -> Aggregators (9 new files under aggregators/)
  -> Insight Models (models/purchaseInsightModels.js)
  -> Business Intelligence Services (api/purchaseIntelligenceApi.js)
  -> Dashboard / Reports / Extensions (not built by this milestone)
```

Identical pipeline shape to Milestone 12A's own Inventory Intelligence domain — same
folders, same `createXApi({ loadSnapshot, cache, diagnostics, recordAudit,
resolveActiveCompanyId })` composition-root shape, same shared `insightCache`/
`biDiagnostics` singletons (namespaced by a distinct `purchaseMetrics:...` cache-key
prefix). Full module map: `docs/architecture/business-intelligence.md` §20.2.

## 2. Files Added (16)

**Platform code (14)**, all under `js/services/businessIntelligence/`:
- `purchase/purchaseDataLoader.js`
- `metrics/purchaseMetrics.js`, `metrics/supplierMetrics.js`
- `calculators/averagePriceCalculator.js`, `calculators/purchaseTrendCalculator.js`,
  `calculators/purchaseFrequencyCalculator.js`, `calculators/supplierSpendCalculator.js`
- `aggregators/purchaseSummaryAggregator.js`, `aggregators/supplierComparisonAggregator.js`,
  `aggregators/supplierRankingAggregator.js`, `aggregators/costHistoryAggregator.js`,
  `aggregators/purchaseTrendSummaryAggregator.js`, `aggregators/purchaseFrequencySummaryAggregator.js`,
  `aggregators/preferredSupplierAggregator.js`, `aggregators/categoryPurchaseSummaryAggregator.js`,
  `aggregators/topPurchasedItemsAggregator.js`
- `recommendations/purchaseRecommendations.js`
- `models/purchaseInsightModels.js`
- `audit/purchaseAuditReporter.js`
- `api/purchaseIntelligenceApi.js`
- `jobs/refreshPurchaseInsightsJob.js`

**Test (1):** `js/services/businessIntelligence/purchaseIntelligence.test.html` (95 checks).

**Documentation (2):** `docs/milestones/milestone-12b-purchase-intelligence.md`, this report.

## 3. Files Modified (7, all additive per each file's own documented extension mechanism)

- `js/services/events/registry/eventTypes.js` — added `'purchaseInsight'` to
  `AGGREGATES`, added one new entry (`PURCHASE_INSIGHT_GENERATED`) to `EVENT_CONTRACTS`.
- `js/services/audit/registry/auditRegistry.js` — added one entry to
  `AUDIT_RECORD_VERSIONS` for the new event type.
- `js/services/jobs/registry/jobIds.js` — added one entry (`REFRESH_PURCHASE_INSIGHTS`)
  to `JOB_IDS`.
- `js/services/jobs/bootstrap/startBackgroundInfrastructure.js` — one new import and one
  new `jobDispatcher.registerJob(...)` call.
- `js/services/jobs/jobEngine.test.html` — the same pre-existing assertion 12A already
  updated once (`"...all 4 jobs registered"`) updated again to `5`, reflecting the second
  legitimately-changed job count.
- `js/services/businessIntelligence/index.js` — appended new export lines for every
  purchase-domain public symbol; every existing export line is untouched (confirmed by
  `git diff` showing only additions in this file).
- `js/services/businessIntelligence/shared/config.js` — appended `PURCHASE_DEFAULTS`;
  `MS_PER_DAY`, `DAYS_PER_YEAR`, `DEFAULT_LOOKBACK_DAYS`, `DEFAULT_CACHE_TTL_MS`,
  `MOVEMENT_DEFAULTS`, and `REORDER_DEFAULTS` are untouched.

`docs/architecture/business-intelligence.md` was updated (§19 corrected to reflect what
was actually built vs. originally predicted, §20 added in full) and
`docs/architecture/platform-roadmap.md` was updated to add 12B to the Completed
Milestones table, per this milestone's own explicit documentation instructions — neither
change alters any other section of either document.

## 4. Reused Components from 12A

Verified by direct import, not by claim:
- `calculators/categoryCalculator.js`'s `resolveCategory`/`groupMetricsByCategory` —
  imported unmodified by `metrics/purchaseMetrics.js` and
  `aggregators/categoryPurchaseSummaryAggregator.js`.
- `calculators/turnoverCalculator.js`'s `calculateDailySalesVelocity` — imported
  unmodified by `calculators/purchaseFrequencyCalculator.js`'s
  `calculatePurchaseFrequency()` (the brief's own "generalize it, don't copy it"
  instruction applied literally: the same division called again with a purchase count
  instead of a sold quantity).
- `shared/config.js`'s `MS_PER_DAY`/`DAYS_PER_YEAR`/`DEFAULT_LOOKBACK_DAYS` — imported
  unmodified by the new purchase-domain files; no new copy of any of these three
  constants exists anywhere under `purchase/`, `metrics/`, or `calculators/`.
- `shared/freezeDeep.js` — imported unmodified by `models/purchaseInsightModels.js`.
- `cache/insightCache.js`'s shared `insightCache` singleton — reused directly (not a new
  instance), namespaced by cache-key prefix.
- `diagnostics/biDiagnostics.js`'s shared `biDiagnostics` singleton — reused directly.
- `extensions/capabilityNames.js`'s three existing `BI_CAPABILITIES` — no new capability
  name was needed or added.
- `jobs/bootstrap/startBackgroundInfrastructure.js`'s own documented job-registration
  extension point — reused a second time (12A used it first).

## 5. New Metrics Added

Per item (`metrics/purchaseMetrics.js`): `purchaseCount`, `purchaseQty`, `purchaseValue`,
`avgPurchasePrice`, `lastPurchasePrice`, `highestPurchasePrice`, `lowestPurchasePrice`,
`lastPurchaseDate`, `daysSinceLastPurchase`, `purchaseFrequency`/`purchaseFrequencyPerYear`,
`avgDaysBetweenPurchases`, `rollingPurchaseAverage`, `costTrend`/`costTrendChangePct`,
`category`. Per supplier (`metrics/supplierMetrics.js`): `purchaseCount`, `purchaseValue`,
`avgOrderValue`, `lastPurchaseDate`, `daysSinceLastPurchase`, `purchaseFrequency`/
`purchaseFrequencyPerYear`.

## 6. New Calculators Added

`calculateAvgPurchasePrice`, `calculateLastPurchasePrice`, `calculateHighestPurchasePrice`,
`calculateLowestPurchasePrice` (averagePriceCalculator.js); `calculateRollingPurchaseAverage`,
`calculateCostTrend` + `COST_TREND` (purchaseTrendCalculator.js); `calculatePurchaseFrequency`
(reuses `calculateDailySalesVelocity`), `annualizePurchaseFrequency`,
`calculateAvgDaysBetweenPurchases` (purchaseFrequencyCalculator.js); `calculateSupplierSpend`
(supplierSpendCalculator.js).

## 7. New Aggregators Added

`aggregatePurchaseSummary`, `aggregateSupplierComparison`, `aggregateSupplierRanking`,
`aggregateCostHistory`, `aggregatePurchaseTrendSummary`, `aggregatePurchaseFrequencySummary`
(generic over item- or supplier-level metrics), `aggregatePreferredSupplier`,
`aggregateCategoryPurchaseSummary` (also serves "Highest Spend Categories" via its own
descending sort), `aggregateTopPurchasedItems`.

## 8. Public APIs Added

`purchaseIntelligence.{getPurchaseSummary, getAveragePurchasePrice, getPurchaseHistory,
getCostHistory, getPurchaseTrends, getSupplierComparison, getSupplierRanking,
getPreferredSupplier, getPurchaseFrequency, getTopPurchasedItems, getCategoryPurchases,
getPurchaseRecommendations, generatePurchaseInsightReport}`, plus
`createPurchaseIntelligenceApi(deps)` for isolated/test instances, plus every new
calculator/aggregator/model-builder re-exported from `index.js`.

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
| `jobs/jobEngine.test.html` | 54/54 ✅ (updated: 4→5 registered jobs, §3) |
| `ui/forms/forms.test.html` | 80/80 ✅ |
| `businessIntelligence/businessIntelligence.test.html` (12A, unmodified) | 128/128 ✅ |
| `businessIntelligence/purchaseIntelligence.test.html` (new) | 95/95 ✅ |
| **Total** | **1085/1085 ✅** |

Run via `python -m http.server` + headless Chrome `--dump-dom`. Additionally verified:
`git diff --stat inventory-intelligence-v1.0 -- <every 12A file + every core ERP file>`
returned empty (zero bytes changed), and the same programmatic dependency-cycle-detection
script 12A's own verification pass used was re-run: 106 files, 260 edges, zero cycles.

## 10. Performance Notes

- `purchase/purchaseDataLoader.js` runs exactly three queries per snapshot (a fourth,
  `purchase_lines`, is skipped entirely if the company has zero purchases in the window)
  — never one query per item, never one query per insight.
- The `{snapshot, purchaseMetrics, supplierMetrics}` bundle is cached for
  `DEFAULT_CACHE_TTL_MS` (5 minutes, shared with Inventory Intelligence) per
  `{companyId, lookbackDays}`; every `getX()` call within that window reuses it.
- `aggregatePurchaseSummary` composes `aggregatePurchaseTrendSummary` and
  `aggregatePurchaseFrequencySummary`'s own outputs rather than re-filtering
  `purchaseMetrics` a third time — the same "aggregators never duplicate calculator
  logic" discipline 12A established.
- `refreshPurchaseInsightsJob` invalidates only the affected company's cache entries, not
  the whole cache.

## 11. Risks Found

None that block this milestone. One shared-cache interaction worth naming (already
documented in `business-intelligence.md` §20.7): `PurchaseCreated` triggers both
`refreshInventoryInsightsJob` (12A) and `refreshPurchaseInsightsJob` (12B), and both call
`insightCache.invalidateCompany()` on the same shared cache — redundant but harmless
(idempotent), not a race condition, and arguably correct (a purchase changes both
domains' cached data for that company).

## 12. Technical Debt (disclosed, none blocking)

- `betterCostOpportunity` compares against a supplier's own historical average price, not
  a live quote — no real-time pricing feed exists anywhere in this ERP.
- Cost trend classification is a simple two-half average comparison, not a regression or
  seasonality-aware model — deliberate, matching this platform's "deterministic
  calculation, not statistics/ML" scope.
- No automated test harness exists for `purchase/purchaseDataLoader.js`'s own three
  Supabase queries — reviewed by inspection, the same disclosed limitation every other
  Supabase-touching file in this platform already has.
- No Dashboard UI consumes either Business Intelligence domain yet — by design,
  explicitly out of scope for both 12A and 12B.

## 13. Readiness Assessment for Milestone 12C (Sales Intelligence)

**Ready — now proven twice, not just once.** Where 12A's own completion report could only
predict that a second domain would reuse the same pipeline, 12B is direct evidence that
prediction held: the same `createXApi(...)` shape, the same shared cache/diagnostics
singletons (namespaced by key prefix), the same three registry-extension points, and two
of 12A's own calculators (`categoryCalculator.js`, `turnoverCalculator.js`) reused
unmodified by an entirely different domain. A Sales Intelligence milestone would add
`sales/salesDataLoader.js` (over `invoices`/`invoice_lines`/`parties` as customers), its
own metrics/calculators (customer purchase behavior, sales trend, product performance)
reusing the same two calculators again if useful, its own aggregators/recommendations/
models, and `api/salesIntelligenceApi.js` with a third distinct cache-key prefix (e.g.
`salesMetrics:...`) — nothing under the current `businessIntelligence/` codebase would
need to change to support it. Not started by this milestone, per its own explicit
instruction to stop after 12B.
