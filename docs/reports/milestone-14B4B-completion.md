# Milestone 14B.4B Completion Report — Current Stock

**Status:** 14B.4B (Current Stock only) complete, as scoped. Per instruction: **STOP
here.** Low Stock, Negative Stock, and the Stock Movement Register (the rest of 14B.4)
are not started. No commit, merge, tag, or push has been made.

## 0. Schema Validation (performed before writing any code, as instructed)

Before implementing, the question "what is the authoritative source for a per-item
current-stock figure?" was checked against both the schema and existing code, not
assumed:

1. **`batches.qty_on_hand` is not universally authoritative.** It is the correct, RPC-
   maintained running balance only for `track_batches = true` items. A
   `track_batches = false` item never gets a batch row at all — its only current balance
   is `stock_ledger`'s full `SUM(qty_in − qty_out)`. This is not an inference; it is
   stated directly in `js/services/businessIntelligence/inventory/inventoryDataLoader.js`
   (lines 146–169), which already special-cases exactly this with a narrow, per-item
   `stock_ledger` aggregate query (`aggregateStockByItem`).
2. **`js/items.js`'s own `listItemsWithStock()`** — already reused by
   `stock-register.html`'s Item filter — only sums `batches.qty_on_hand`. It does **not**
   handle the non-batch-tracked case, so it was ruled out as Current Stock's source (it
   would silently show `0` for those items).
3. **Business Intelligence's own `metrics/itemMetrics.js`** already implements the
   correct two-path `computeCurrentStock()` logic for every item — internal-only, so a
   report may never import it directly (ADR-0004). But its results are exposed through
   the platform's **public** API: `inventoryIntelligenceApi.js`'s `getItemMetricsSnapshot()`
   returns `{ companyId, generatedAt, lookbackDays, itemMetrics }`, where `itemMetrics` is
   the **complete**, per-item array (not a filtered subset like `getLowStockItems()`),
   each item already carrying a correctly-computed `currentStock`.

**Decision presented and confirmed before writing code**: Current Stock declares
`dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE` and calls
`inventoryIntelligence.getItemMetricsSnapshot({ activeOnly: true })` directly —
ADR-0004 path 1. No new ERP data provider file exists for this report, and none was
written.

## 1. Architecture Review

No changes to `js/services/reporting/` this milestone — `CATEGORY`, `STATUS`, and
`SEARCH` (all pre-existing filter keys) cover everything this report needs. Registry,
Contract, Lifecycle, Context, Shell, Toolbar, Filter Bar, Print, and Export are all
reused exactly as the prior three reports proved out, with one architecturally
significant difference in how the Lifecycle and Filter Bar are used together (§3).

`reportingPlatform.test.html`: still **67/67** (no platform file touched).

**Why this report is BI-sourced while Sales/Purchase/Stock Register are ERP-sourced**:
ADR-0004's own test is "does Business Intelligence already compute this, even
approximately? If yes, path 1 (BUSINESS_INTELLIGENCE). Is it a raw transactional
listing? Path 2 (ERP)." Sales/Purchase/Stock Register are all dated, filtered listings of
individual **transactions** (invoices, bills, ledger movements) — a shape no BI aggregate
was ever built to expose, and BI's Frozen Architecture correctly forecloses bending its
aggregate-shaped contracts to provide one. Current Stock is different in kind: it is a
per-item **snapshot** of an already-computed figure (not a transaction history), and that
exact snapshot — correctly handling both batch-tracked and non-batch-tracked items — is
something Business Intelligence was already built to compute and already exposes
publicly. Building an independent ERP-path replica of that same two-path logic would have
been the literal duplication ADR-0004 and this milestone's own instruction both warn
against; consuming the existing, tested, cached computation through its sanctioned public
entry point is the correct application of the same ADR, not an exception to it.

## 2. Data Provider Review

**None exists, deliberately.** No `js/currentStockData.js` was created. The report's
`<script type="module">` imports `inventoryIntelligence` from
`js/services/businessIntelligence/index.js` (the platform's own public barrel — never
`metrics/`, `calculators/`, `aggregators/`, or the data loader directly) and calls
`getItemMetricsSnapshot({ activeOnly: true })` once per page load. That call is cached by
Business Intelligence's own `insightCache` — this report neither introduces nor bypasses
that caching.

Everything after that one call is presentation only, confirmed line-by-line against the
instruction's own boundary:
- **Filtering** (`applyPresentation()`'s `category`/`status` checks) — array `.filter()`
  over fields BI already computed (`item.category`, and a `stockStatusOf()` bucket
  compare, see below). No field is recomputed.
- **Searching** — a plain case-insensitive substring match against `item.name`/`item.code`.
- **Sorting** — `.sort()` by already-computed fields (`name`, `currentStock`,
  `inventoryValue`). No aggregation, no new arithmetic across rows.
- **Pagination** — `Array.prototype.slice(0, visibleCount)` over the one in-memory array;
  since `getItemMetricsSnapshot()` is not server-paginated, "Load more" here means
  revealing more of what was already fetched, not a new query.
- **`stockStatusOf(item)`** — the one place this report compares two numbers
  (`item.currentStock` vs. `item.lowStockThreshold`, both already computed by BI) to
  choose a label ("Out of Stock"/"Low Stock"/"In Stock"/"Not Tracked"). This is the same
  kind of presentation-level bucketing already established twice (Payment Status on the
  Sales and Purchase Registers, comparing `amount_paid`/`amount_due`) — a label chosen
  from existing numbers, not a new number derived from raw data.

## 3. Current Stock Capabilities

| Capability | Implementation |
|---|---|
| Category filter | Reused `CATEGORY` filter key; options derived from the real, distinct `category` values present in this company's own loaded items (BI's own HSN/SAC-code proxy, per `categoryCalculator.js` — no invented enum) |
| Stock Status filter | Reused `STATUS` filter key — Out of Stock / Low Stock / In Stock / Not Tracked, computed via `stockStatusOf()` |
| Search | Name or code, case-insensitive substring |
| Date Range / Supplier / Customer / Payment Status | **Not declared** — a point-in-time snapshot has no meaningful date range, and neither supplier/customer/payment concepts apply to "how much of this item exists right now" |
| Sort by column | Page-local select: Name (A-Z), Current Stock (highest/lowest first), Inventory Value (highest first) |
| Pagination | "Load more" over the in-memory array (see §2) — same visual convention as every prior register, different mechanism underneath |
| Print current view | `triggerPrint()`, unchanged shared framework |
| Export filtered view | Synchronous CSV of the current filtered array — no extra round-trip needed, since everything is already in memory |

Row presentation: `createListRow()` — item name as primary text, a stock-status badge,
code/category/unit in `meta`, and two `.stock-chip` values (Current Stock with unit,
Inventory Value as money) — the same visual language as every prior report.

**One architecturally distinct choice**: the `ReportRun`'s lifecycle governs exactly one
thing — the single `getItemMetricsSnapshot()` fetch (`IDLE → LOADING → LOADED`, with
`run.data` holding the **full, unfiltered** array). Filter/search/sort/pagination changes
do **not** create new lifecycle runs or re-render through a fake `LOADING` state, since no
new async work happens — they call the same `renderContentForRun(run)` again, which
re-derives the presented slice from the one already-loaded `run.data`. `renderReportState`'s
own `isEmpty` check is overridden to mean "this company genuinely has zero items," not
"zero items match the current filters" — the latter is handled inside `renderContent`
itself (a second, presentation-level empty message), the same "empty due to filters vs.
empty overall" distinction `items.html`/`suppliers.html` already draw for their own lists.

## 4. Performance Observations

- **One network round trip for the entire report**, cached by BI's own `insightCache` —
  categorically cheaper than any of the three ERP-sourced registers' own per-page
  `.range()` queries, at the cost of loading every item up front rather than a page at a
  time. Reasonable for this app's realistic item-catalog scale; would need revisiting
  (by whoever owns the BI snapshot's own performance envelope, not this report) if a
  company's item catalog grew very large — that concern belongs to
  `inventoryDataLoader.js`, not this report.
- All filter/search/sort/pagination operations are synchronous, in-memory array
  operations on however many items `getItemMetricsSnapshot()` returned — no additional
  cost per interaction.
- Not measured against a live Supabase session — same disclosed environment limitation as
  every prior milestone here.

## 5. Regression Summary

- `reportingPlatform.test.html`: **67/67**, unchanged (no platform file touched this
  milestone).
- `current-stock.html` and `reports.html`: verified headlessly (isolated Chrome profile)
  — both redirect cleanly to `index.html` unauthenticated. The server log shows 99
  requests under `js/services/businessIntelligence/**` (the full module graph
  `getItemMetricsSnapshot()` pulls in — loaders, metrics, calculators, aggregators,
  models, cache, diagnostics, audit) all resolving `200`; only the pre-existing
  `favicon.ico` 404 anywhere in the session.
- `node --check` clean on the new `.js` file and both pages' inline module scripts.
- **Not run**: authenticated interactive verification (no reachable seeded Supabase
  session in this environment — same disclosed limitation as every prior milestone here).

## 6. Files Modified

**New (3):**
- `js/operationalReports/currentStock.js` — Report Definition + registration
  (BUSINESS_INTELLIGENCE-sourced; no data provider file)
- `current-stock.html` — the Current Stock screen
- `docs/reports/milestone-14B4B-completion.md` — this report

**Modified (1):**
- `reports.html` — `+1` import, `+1` idempotent `registerCurrentStockReport()` call

**Untouched:** everything under `js/services/reporting/` (no platform extension needed
this time), everything under `js/services/businessIntelligence/**` (read to identify
`getItemMetricsSnapshot()`, never modified), `schema.sql`, `css/shared.css`, `menu.html`,
and every other business screen.

## 7. Lessons Learned / Notes for the Rest of 14B.4

1. **Not every Inventory report is ERP-sourced.** Low Stock and Negative Stock are, on
   their face, even more obviously BI-shaped than Current Stock — `inventoryIntelligence`
   already has `getLowStockItems()`/`getOutOfStockItems()` (filtered subsets of the same
   `itemMetrics` array). Before writing either, check that public API first; a schema
   validation like this one should precede any new provider file, not follow an assumption
   that the Stock Register's ERP-path pattern applies uniformly across 14B.4.
2. **The Stock Movement Register, by contrast, is very likely ERP-sourced** — it is a
   dated transactional listing (`stock_ledger` rows over time), the same shape Sales/
   Purchase/Stock Register already are, not a point-in-time snapshot. It should probably
   reuse `js/stockRegisterData.js` directly rather than get its own new provider file —
   worth confirming shape-fit (ADR-0005 §4) before deciding whether it's truly a
   duplicate of the existing Stock Register or a distinct enough view to need its own
   query, before writing any code.
3. **A BI-sourced report's "provider" is the platform's own public API function itself** —
   there is nothing to write beyond the Report Definition when BI already exposes the
   exact shape needed. Resist the reflex to create a thin `js/*Data.js` wrapper file
   purely for consistency with the ERP-sourced reports; ADR-0005 governs ERP providers
   specifically and does not require one to exist for every report.
4. **Presentation-level bucketing (Payment Status, now Stock Status) is a recurring,
   legitimate pattern** across both ERP- and BI-sourced reports — comparing two
   already-computed numbers to choose a label is not a calculation this platform's own
   "no business rules" boundary forbids, in either data-source path.

**Per instruction: STOP here.** Waiting for review/approval before continuing to Low
Stock, Negative Stock, or the Stock Movement Register.
