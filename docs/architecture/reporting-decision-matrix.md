# Reporting — Business Analysis Report Decision Matrix

**Read this first, before proposing any new report (14D and beyond).** This is a
practical, fast-path checklist, not a design document — it consolidates the audit
discipline actually exercised across Milestones 14B and 14C into one place, so a future
contributor does not have to re-derive it from six ADRs and two milestone completion
reports every time. It does not replace them: `docs/architecture/ADR/0003` through `0006`
remain the authoritative record of *why* each rule exists; this document is *how to apply
them, in order, to a specific candidate report*.

This document is a living reference — update §3's index and §4's worked-examples list
every time a report is added, eliminated, or a BI function goes from unconsumed to
consumed, the same way `docs/reports/report-catalog.md` is kept current.

## 1. The decision tree

Run every candidate report through this in order. Stop at the first match — do not
continue past it.

**1. Does this exact report already exist?** Check `docs/reports/report-catalog.md`'s
Quick Reference. → **STOP. Don't build. Cite it.**

**2. Is it the same screen and the same provider/API call as an existing report, entered
with a different starting filter value?** → **Registry Preset.** One new
`ReportDefinition`, `href` carries a query param the screen reads once on load and
pre-seeds into its own filter state (still user-changeable). Zero new screen, zero new
provider. Precedent: Low Stock / Negative Stock (14B.4C), Fast Moving / Slow Moving / Dead
Stock (14C.5).

**3. Is it the same screen and the same provider/API call as an existing report, differing
only in which `category` it should be discoverable under?** → **Registry Alias.** One new
`ReportDefinition`, identical `href`, no query param. Zero new screen, zero new provider.
Precedent: Customer Ledger / Supplier Ledger (14B.5/14B.6).

**4. Would it return the same rows (or a strict subset, or the same rows differently
sorted) an existing report's own `CSV_COLUMNS` already exposes?** Check field-by-field
against the candidate's own real need before writing anything. If the existing report's
CSV already contains every field the candidate needs, it is a duplicate under a new name,
not a new report. → **STOP. Document why, per report, in the milestone's own audit
section.** Precedent: Stock Movement Register (14B.4D, ERP duplicate of Stock Register),
Customer Performance Analysis and Supplier Performance/Contribution Analysis (14C,
BI-sourced duplicates of Customer/Supplier Purchase Profile).

**5. Does an existing Business Intelligence public API already compute the answer, even
approximately?** (ADR-0004's own test.) Check §3's index below before reading the full
`business-intelligence-api.md`.
- **Yes** → `dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE`. Call the existing
  public API function directly — never `metrics/`/`calculators/`/`aggregators/`. **No data
  provider file** (ADR-0006 decision 2). Continue to §2 below for `category`.
- **No** → continue to 6.

**6. Is the real need a row-level ERP listing — a "what happened, and when" question no BI
aggregate exposes?** → `dataSource: REPORT_DATA_SOURCES.ERP`. One new provider, named for
the domain, following ADR-0005 exactly (check whether an existing `js/*.js` query — or a
sibling report's own provider — already returns most of what's needed before writing a
new function). `category` is always the ERP domain's own category (`sales`/`purchase`/
`inventory`/`customer`/`supplier`) for a row-level report — never
`BUSINESS_INTELLIGENCE` (§2). If neither 5 nor 6 apply, continue to 7.

**7. Does answering it require a genuinely new calculation, classification, or threshold
Business Intelligence has never computed** (e.g., an ABC/Pareto ranking, a new movement
predicate)? → **STOP.** This is a Business Intelligence platform decision
(`business-intelligence-platform.md` §13 — "frozen means extend, not redesign"), made
under that platform's own governance, not a Reporting decision. Document the gap in the
milestone's own completion report; do not approximate it inside Reporting. Precedent: ABC
Analysis (14C, deferred).

**8. Does answering it require joining more than one BI domain's raw rows by a shared key
that no existing domain already composes** (e.g., merging four `CategorySummary` variants
by category)? → **STOP, same reason as 7.** Cross-domain composition is Business
Intelligence's own job (the pattern Supplier Intelligence/12E and Business Dashboard/12F
exist for) — raise it there. A report *may* call several BI domains' own separate public
functions and present their results side-by-side for the reader to compare (Business
Performance Summary, 14C, presents five domains' summaries in adjacent sections) — that is
presentation, not composition. The line: presentation never merges two domains' rows into
one row keyed by a shared field; that transformation is composition. Precedent:
cross-domain Category Performance (14C, deferred).

## 2. Category assignment — the litmus test

`REPORT_CATEGORIES` has six values: `SALES`, `PURCHASE`, `INVENTORY`, `SUPPLIER`,
`CUSTOMER`, `BUSINESS_INTELLIGENCE`. `dataSource` (`ERP` vs `BUSINESS_INTELLIGENCE`) and
`category` are **independent choices** — a BI-sourced report is not automatically
`category: BUSINESS_INTELLIGENCE` (14B's five BI-sourced Operational Reports all use a
domain category). The test that has held across 14B and 14C:

> **Is this report a directory of one entity type — "what do I have / who do I owe /
> who owes me"** (one row per item, customer, supplier, or transaction, the reader scans
> for a specific record)**? Use the matching domain category.**
> **Or is it an analysis — a ranking, trend, or classification that answers "how is my
> business performing," cutting across what the reader would think of as one dataset**
> (the reader reads it to understand a pattern, not to find one record)**? Use
> `BUSINESS_INTELLIGENCE`.**

| Report | dataSource | category | Why |
|---|---|---|---|
| Current Stock (14B.4B) | BUSINESS_INTELLIGENCE | `inventory` | A directory — every item, one row each, "what do I have" |
| Customer Purchase Profile (14B.5) | BUSINESS_INTELLIGENCE | `customer` | A directory — every customer, one row each, "who buys from me" |
| Product Performance Analysis (14C.1) | BUSINESS_INTELLIGENCE | `businessIntelligence` | A ranking — "which products perform best," read for the pattern, not to look up one item |
| Margin Analysis (14C.4) | BUSINESS_INTELLIGENCE | `businessIntelligence` | A cross-cutting profitability question, not "what items do I have" |
| Business Performance Summary (14C.6) | BUSINESS_INTELLIGENCE | `businessIntelligence` | Whole-company, no single entity type at all |

If a candidate genuinely straddles the line, prefer `BUSINESS_INTELLIGENCE` — it is the
category reserved for exactly this ambiguity (ADR-0006 decision 1), and a domain category
implicitly promises "this is one more entry in that domain's directory," a promise an
analytical report should not make.

## 3. Quick index — business question → BI function

Consult this before opening `business-intelligence-api.md` in full. **Consumed** means a
report or `dashboard.html` calls it directly today; **available** means it exists,
documented, zero-calculation, and ready for the next report with a real need for it — not
a gap, just not yet asked for.

### Inventory Intelligence (`inventoryIntelligence`)

| Question | Function | Status (as of 14C) |
|---|---|---|
| Every item's current stock + value | `getItemMetricsSnapshot()` | Consumed — Current Stock, Low Stock, Negative Stock (14B) |
| Full company inventory health report | `getInventorySummary()` | Consumed — Product Movement Analysis (14C.5) |
| Just the headline valuation figure | `getInventoryValue()` | Available |
| Per-category stock + value | `getCategoryPerformance()` | Consumed — Inventory Investment Analysis (14C.5) |
| Low stock / out of stock / dead / slow / fast / overstock lists individually | `getLowStockItems()` / `getOutOfStockItems()` / `getDeadStock()` / `getSlowMovingItems()` / `getFastMovingItems()` / `getOverstockItems()` | Reachable via `getInventorySummary()`'s own embedded lists (14C.5) — calling these individually would be redundant unless a future report needs only ONE list without the rest of the summary |
| Single company-wide turnover ratio | `getInventoryTurnover()` | Available |
| Actionable reorder recommendations | `getReorderRecommendations()` | Available |

### Purchase Intelligence (`purchaseIntelligence`) — first consumed in 14C

| Question | Function | Status |
|---|---|---|
| Per-item purchasing behavior (raw rows) | `getPurchaseMetricsSnapshot()` | Consumed — Purchase Analysis (14C.3) |
| Full company purchase report | `getPurchaseSummary()` | Available |
| Qty-weighted avg price for one item | `getAveragePurchasePrice({itemId})` | Available |
| Full per-item purchase insight (history + supplier comparison + trend) | `getPurchaseHistory({itemId})` | Available — item drill-down, not yet built |
| Raw chronological price/qty history for one item | `getCostHistory({itemId})` | Available — chart-shaped, no charting library exists in this repo yet (see §5) |
| Company-wide rising/falling/stable cost trend buckets | `getPurchaseTrends()` | Reachable via each `PurchaseMetric` row's own `costTrend` field (14C.3 buckets it as a filter, doesn't call this) |
| Every supplier for one item, cheapest first | `getSupplierComparison({itemId})` | Available |
| Supplier ranking (purchase-domain, narrower) | `getSupplierRanking()` | Available — prefer `supplierIntelligence`'s own richer version (see 14B.6 finding) unless the narrower purchase-only shape is specifically wanted |
| Cheapest supplier for one item | `getPreferredSupplier({itemId})` | Available |
| Purchase frequency (per item or company-wide buckets) | `getPurchaseFrequency()` | Available |
| Top N items by value/qty/count | `getTopPurchasedItems()` | Available |
| Per-category purchase totals | `getCategoryPurchases()` | Available |
| Advisory recommendation per item | `getPurchaseRecommendations()` | Available |

### Sales Intelligence (`salesIntelligence`)

| Question | Function | Status |
|---|---|---|
| Per-item sales performance (raw rows) | `getSalesMetricsSnapshot()` | Consumed — Customer Purchase Profile (`.customerMetrics`, 14B.5), Product Performance Analysis (`.salesMetrics`, 14C.1) |
| Full company sales report | `getSalesSummary()` | Available |
| Just the revenue/margin headline | `getRevenueSummary()` | Available |
| Rising/falling/stable sales trend buckets | `getSalesTrends()` | Reachable via each `SalesMetric` row's own `costTrend` field (14C.1 buckets it as a filter) |
| Top/worst N items | `getTopSellingItems()` / `getWorstSellingItems()` | Available |
| Every customer, ranked | `getCustomerRanking()` | Reachable via `getSalesMetricsSnapshot()`'s own `customerMetrics` (Customer Purchase Profile, 14B.5) |
| Per-category sales totals | `getCategoryPerformance()` | Consumed — Category Sales Performance (14C.2) |
| Advisory recommendations (items + customers) | `getSalesRecommendations()` | Available |
| Top N customers | `getTopCustomers()` | Reachable via Customer Purchase Profile's own sort (14B.5) |
| Monthly sales series | `getSeasonality()` | Consumed — Sales Trend Analysis (14C.2) |
| Full item ranking (uncapped) | `getRevenueRanking()` | Available |

### Pricing Intelligence (`pricingIntelligence`) — first consumed in 14C

| Question | Function | Status |
|---|---|---|
| Per-item margin/markup/discount (raw rows) | `getPricingMetricsSnapshot()` | Consumed — Margin Analysis (14C.4) |
| Full company pricing report | `getPricingSummary()` | Available |
| Margin-focused view with above/below-target split | `getMarginAnalysis({targetMarginPct})` | Available — deliberately NOT used by Margin Analysis (14C.4), which sorts on the raw `marginPct` instead of re-deriving a threshold bucket; a future report specifically wanting the target-split view should call this directly rather than reimplementing the threshold comparison |
| Markup-focused view | `getMarkupAnalysis()` | Available |
| One item's full price history (both sides) | `getPriceHistory({itemId})` | Available — item drill-down, not yet built |
| Rising/falling/stable price trend buckets | `getPriceTrends()` | Reachable via `getPricingMetricsSnapshot()` rows' own trend fields |
| Discount rollup + most-discounted items | `getDiscountAnalysis()` | Available |
| Top/bottom N by margin | `getHighestMarginItems()` / `getLowestMarginItems()` | Reachable via Margin Analysis's own sort (14C.4) |
| Per-category margin/markup | `getCategoryPricing()` | Available — a future Category Pricing report, or fold into an existing category screen |
| Advisory recommendation per item | `getPricingRecommendations()` | Available |

### Supplier Intelligence (`supplierIntelligence`)

| Question | Function | Status |
|---|---|---|
| Per-supplier composed performance (raw rows) | `getSupplierMetricsSnapshot()` | Consumed — Supplier Purchase Profile (14B.6) |
| Full company supplier report | `getSupplierSummary()` | Available |
| Supplier ranking (composed, richer) | `getSupplierRanking()` | Reachable via Supplier Purchase Profile's own sort (14B.6) |
| Every supplier side by side | `getSupplierComparison()` | Reachable via Supplier Purchase Profile (14B.6) — same array |
| Top N by preferred-item count | `getPreferredSuppliers()` | Available |
| One supplier's full detail (history + recommendation) | `getSupplierPerformance({supplierId})` | Available — supplier drill-down, not yet built |
| Pricing-focused supplier view | `getSupplierPricing()` | Available |
| Revenue/margin/inventory contribution ranking | `getSupplierContribution()` | Reachable via Supplier Purchase Profile's own CSV — already exports `revenue_contribution`/`margin_contribution_pct` (14B.6); a dedicated report was rejected as a duplicate (14C, §1.2) |
| Advisory recommendation per supplier | `getSupplierRecommendations()` | Available |

### Business Dashboard (`businessDashboard`)

| Question | Function | Status |
|---|---|---|
| Whole composed business state | `getBusinessSnapshot()` | Consumed — `dashboard.html` (13C), Business Performance Summary (14C.6) |
| Headline-only KPI bar | `getDashboardSummary()` | Available |
| 17 renderable dashboard cards | `getDashboardCards()` | Available — zero consumers anywhere in the app; `dashboard.html` re-implements equivalent rendering by reading raw snapshot fields instead (disclosed in that screen's own comments) |

**`generateXInsightReport()` / `generateDashboardReport()` functions** (one per domain, 6
total): identical output to their `getX()` sibling, plus an Audit Platform side effect.
Zero call sites anywhere in the app as of 14C — every report and `dashboard.html` reads via
the non-auditing `getX()` path. A future report that is explicitly a generated/archived
artifact (not just displayed) is the natural first consumer of this family; not evaluated
as a real need by any milestone through 14C.

## 4. Worked examples — where to look for the reasoning

| Report / decision | Where the reasoning is written down |
|---|---|
| Stock Movement Register eliminated | `docs/reports/milestone-14B4D-completion.md` |
| Low Stock / Negative Stock as presets | `docs/reports/milestone-14B4C-completion.md` |
| Customer/Supplier Ledger as aliases | `docs/reports/milestone-14B5-completion.md`, `-14B6-` |
| Current Stock is BI-sourced, category `inventory` | `js/operationalReports/currentStock.js` header comment |
| Supplier Purchase Profile sources the richer domain | `docs/reports/milestone-14B6-completion.md` |
| Customer/Supplier Performance Analysis eliminated as duplicates | `docs/reports/milestone-14C-completion.md` §1, `docs/architecture/ADR/0006` |
| ABC Analysis and cross-domain Category Performance deferred | `docs/reports/milestone-14C-completion.md` §1, §12 |
| Product Movement Analysis validated as distinct from Stock Register | `docs/architecture/ADR/0006-business-analysis-report-pattern.md`, `js/analysisReports/productMovementAnalysis.js` header comment |
| Margin Analysis absorbs "Product Profitability" via one sort control | `js/analysisReports/marginAnalysis.js` header comment |
| BUSINESS_INTELLIGENCE category reserved for analysis reports | `docs/architecture/ADR/0006-business-analysis-report-pattern.md` |

## 5. Known open questions for whoever scopes 14D

Not decided by this document — flagged here so a future milestone doesn't have to
rediscover them from scratch:

- **Item/supplier drill-down reports** (`getPurchaseHistory({itemId})`,
  `getPriceHistory({itemId})`, `getSupplierPerformance({supplierId})`) are all "available"
  per §3 but need a different shell shape than every report built so far — every 14B/14C
  report is a list of many rows; a drill-down is one entity's own detail page, reached by
  clicking a row elsewhere (no existing report screen navigates to another report with an
  id in the URL). This is a genuinely new navigation pattern for the Reporting Platform,
  not a straightforward "next report."
- **No charting library exists anywhere in this repository** (confirmed by direct
  search — no `package.json`, no CDN script tag, no `<canvas>`/`chart.js`/`d3` anywhere).
  The one precedent, `dashboard.html`'s seasonality bar chart, is hand-built CSS
  `<div>`s with percentage heights — no SVG, no tooltip library, native `title` attribute
  only. Any future report wanting a visual (e.g., `getCostHistory()`/`getPriceHistory()`
  charted over time) follows that precedent or raises a "should this app take a charting
  dependency" decision explicitly — not assumed by this document.
- **`generateXInsightReport()` family remains fully unconsumed** (§3) — worth a deliberate
  decision on whether a future "generated/archived" report type is a real need, rather
  than leaving six functions permanently dark.

## 6. Anti-Patterns

Things that must never happen, regardless of how a candidate report's real need is
argued. Each of these was either explicitly rejected by an ADR's own "Alternatives
considered" section or would silently undo a rule §1–2 above depend on. If a proposal
requires one of these, the proposal is wrong, not the rule.

**Do NOT:**

- **Create `reportData.js`, or any other single shared ERP query file that grows a
  function per report.** ADR-0005 rejected this by name — no natural ownership boundary,
  and the file's own git history stops meaning anything. One provider per ERP domain,
  never a shared one (the one narrow, documented exception: two reports consuming the
  exact same immutable dataset with zero report-specific transformation — ADR-0005's own
  "one narrow exception" clause, not a general escape hatch).
- **Create `genericReportEngine.js`, `queryFactory.js`, or any `buildReportQuery({table,
  filters, sort})`-shaped generic engine.** Rejected twice — once by ADR-0004 for the ERP
  layer in general, once by ADR-0005 by name. Different reports filter, sort, and label
  fundamentally different shapes of data; a generic engine either grows enough
  configuration to become as unreadable as separate files, or forces every report into a
  lowest-common-denominator shape it doesn't actually have.
- **Duplicate a Business Intelligence calculation inside a report.** If a number needs
  deriving — a percentage, a threshold comparison, a trend classification — and Business
  Intelligence already derives it, call the function that returns it. Never recompute
  `marginPct`, re-bucket a trend, or re-evaluate a threshold (`targetMarginPct`,
  `lowStockThreshold`, etc.) from raw fields inside a report screen. This is the single
  most important rule in this document — every report built through 14C passed the "zero
  calculation" test in its own Consumption Ledger entry (`milestone-14C-completion.md`
  §3) specifically because this was never violated.
- **Replay ERP transactions when a Business Intelligence aggregate already answers the
  question.** Never query `sales`/`purchases`/`stock_ledger` directly, then sum/group/
  average them in JavaScript, to produce a number `salesIntelligence`/`purchaseIntelligence`/
  `inventoryIntelligence` already computes. That is ADR-0004's Option A, rejected for
  Business Intelligence's own domains and never sanctioned for Reporting either.
- **Build a duplicate report page instead of a preset.** If two candidate reports share a
  screen, a provider/API call, and every column, and differ only in a starting filter
  value, they are one screen with a `?param=` preset (§1 step 2) — not two `.html` files
  with copy-pasted logic.
- **Build an alias as a second, separately-implemented screen.** An alias exists purely
  for discoverability under a second `category` — its `href` points at the SAME screen,
  unmodified. Writing a second screen "for consistency" or "in case it needs to diverge
  later" is speculative construction this codebase's own repeated discipline (13A–14C)
  rejects.
- **Introduce a new ERP data provider without running it through ADR-0005.** Before a new
  `js/*Data.js` file is created: confirm no existing `js/*.js` query or sibling provider
  already returns most of what's needed (ADR-0005 rule 4), confirm it is domain-shaped and
  not screen-shaped (ADR-0005's own Stock Register/Current Stock/Low Stock counter-example),
  and confirm the report is actually `dataSource: ERP` in the first place (§1 step 6) — a
  BI-sourced report never gets a provider file at all (ADR-0006 decision 2).
- **Modify Business Intelligence because Reporting wants a different output shape.** The
  BI Platform is frozen (`business-intelligence-platform.md` §13) — "extend, never
  redesign." A report screen re-shaping, re-labeling, or re-filtering an already-returned
  array is Reporting's own job; asking a BI function to change its return shape to save a
  few lines of presentation code in one report is not a Reporting decision to make. If BI
  genuinely doesn't expose an answer, that is §1 step 7/8 (a Business Intelligence
  platform decision), never a Reporting-side modification request treated as routine.
- **Bypass the public BI API objects.** A report imports `inventoryIntelligence` /
  `purchaseIntelligence` / `salesIntelligence` / `pricingIntelligence` /
  `supplierIntelligence` / `businessDashboard` from
  `js/services/businessIntelligence/index.js` only — never a subfolder, never
  `metrics/`/`calculators/`/`aggregators/`/a data loader directly, even for a "just this
  once, it's simpler" internal function. Every domain enforces this against its own
  siblings (`business-intelligence-api.md` §2); a report holds the identical bar.

## References

- `docs/architecture/ADR/0003-reporting-platform-foundation.md` — registry/permissions/
  extension-point rules
- `docs/architecture/ADR/0004-reporting-data-access-strategy.md` — the two sanctioned data
  paths, and the "does BI already compute this" test §1 step 5 applies
- `docs/architecture/ADR/0005-operational-report-data-provider-pattern.md` — the
  ERP-provider rules §1 step 6 applies
- `docs/architecture/ADR/0006-business-analysis-report-pattern.md` — the category and
  no-data-provider rules §1 step 5 and §2 apply
- `docs/architecture/business-intelligence-api.md` — the full function contracts §3 indexes
- `docs/reports/report-catalog.md` — the canonical current-state report inventory §1 step 1
  checks against
- `docs/reports/milestone-14C-completion.md` — the audit this document's own §1 tree was
  extracted from
