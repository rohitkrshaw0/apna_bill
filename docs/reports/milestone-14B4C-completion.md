# Milestone 14B.4C Completion Report — Low Stock & Negative Stock

**Status:** 14B.4C complete, as scoped. Per instruction: **STOP here.** The Stock
Movement Register (the remainder of 14B.4) is not started. No commit, merge, tag, or push
has been made.

## 0. Report Architecture Review (performed before writing any code, as instructed)

**Question**: are Low Stock and Negative Stock genuinely independent reports, or
predefined filtered views of Current Stock?

**Findings**:
- Both would need the exact same data: `inventoryIntelligence.getItemMetricsSnapshot()`
  — the same BUSINESS_INTELLIGENCE call Current Stock already makes, no different
  parameters, no different shape.
- Both would show the exact same columns (code, name, category, unit, current stock,
  inventory value, stock status) — nothing materially different to display.
- Both would compose the identical shell/toolbar/filter-bar/print/export — there is no
  report-specific UI either would need that Current Stock doesn't already have.
- **Business Intelligence itself confirms there is no separate "Negative Stock" concept.**
  `js/services/businessIntelligence/calculators/movementCalculator.js` (read, not
  imported — ADR-0004 forbids importing calculators/ directly) has exactly two predicates
  in this space: `isOutOfStock` (`trackStock && currentStock <= 0`, deliberately combining
  zero and negative into one signal) and `isLowStock`. Low Stock and Negative Stock are
  not two different business concepts — they are two different **thresholds** over the
  same two already-loaded numbers (`currentStock`, `lowStockThreshold`) Current Stock
  already reads.

**Conclusion**: both are predefined filter presets of Current Stock, not independent
reports. No new HTML screen, no new data call, no new provider file. Per instruction
("repository reality wins... prefer reuse over duplication"), implemented as two
additional, lightweight `ReportDefinition`s whose `href` points at `current-stock.html`
with a `?status=` query parameter that screen already reads to pre-select its own Stock
Status filter — still a single shared screen, still fully user-changeable once loaded
(not a locked-down separate page masquerading as one).

## 1. Architecture Review

**No changes to `js/services/reporting/`** — nothing new needed; `CATEGORY`/`STATUS`/
`SEARCH` already existed. **No new HTML file, no new data provider.** The only new files
are two more `ReportDefinition` exports + two more idempotent `register*()` functions
inside the *same* `js/operationalReports/currentStock.js` file Current Stock already
used — colocated deliberately, since separating them into their own files would visually
imply three independent reports exist when they don't.

`current-stock.html` gained: a `PRESET_STATUS` read from `window.location.search`, a
`PRESET_TITLES` map driving the page's own `document.title`/header crumb/log
messages/CSV filename, and a finer five-way `stockStatusOf()` partition (adding
`negativeStock`, splitting what was previously one combined `outOfStock` bucket into
`negativeStock` (`currentStock < 0`) and `outOfStock` (`currentStock === 0` exactly) — a
presentation-level refinement, not a contradiction of BI's own combined `isOutOfStock`
definition, which nothing here recomputes or overrides.

`reportingPlatform.test.html`: still **67/67** (no platform file touched).

## 2. Data Provider Review

**None created, and none needed.** Both presets reuse the exact same single
`inventoryIntelligence.getItemMetricsSnapshot({ activeOnly: true })` call Current Stock
already makes — same cache entry, same network cost, zero duplication. Filtering to
`status=lowStock` or `status=negativeStock` happens exactly the same way any other Stock
Status selection already does: an in-memory `Array.prototype.filter()` over
already-computed fields, immediately after the one BI call resolves.

## 3. Capabilities

Identical to Current Stock in every respect — Category filter, Stock Status filter
(now five values instead of four), Search, sort, "Load more" pagination, Print, CSV
export — because it is the same screen. The only observable differences when entered via
a preset:

| | Current Stock | Low Stock (`?status=lowStock`) | Negative Stock (`?status=negativeStock`) |
|---|---|---|---|
| Page title / crumb | "Current Stock" | "Low Stock" | "Negative Stock" |
| Initial Stock Status filter value | (none — "All") | "Low Stock", pre-selected | "Negative Stock", pre-selected |
| CSV filename stem | `current-stock-` | `low-stock-` | `negative-stock-` |
| Still changeable by the user after load? | n/a | Yes | Yes |

## 4. Performance Observations

Strictly better than three independent screens would have been: one BI call, one cache
entry, shared across whichever of the three discoverable Registry entries a user actually
clicks — instead of three separate `getItemMetricsSnapshot()` invocations (each a
separate cache key) had these been built as genuinely separate pages each fetching their
own copy of the same data.

## 5. Regression Summary

- `reportingPlatform.test.html`: **67/67**, unchanged.
- All four URLs verified headlessly (isolated Chrome profile): `current-stock.html`,
  `current-stock.html?status=lowStock`, `current-stock.html?status=negativeStock`, and
  `reports.html` all redirect cleanly to `index.html` unauthenticated; only the
  pre-existing `favicon.ico` 404 anywhere in the session.
- `node --check` clean on the updated `.js` file and both pages' inline module scripts.
- **Not run**: authenticated interactive verification (no reachable seeded Supabase
  session in this environment — same disclosed limitation as every prior milestone here).

## 6. Files Modified

**New (1):**
- `docs/reports/milestone-14B4C-completion.md` — this report

**Modified (3):**
- `js/operationalReports/currentStock.js` — `+2` `ReportDefinition`s
  (`lowStockReportDefinition`, `negativeStockReportDefinition`), `+2` register functions
- `current-stock.html` — preset-reading, preset-aware title/crumb/log messages/CSV
  filename, five-way (was four-way) Stock Status partition
- `reports.html` — `+2` imports, `+2` idempotent register calls

**Not created (deliberately):** `low-stock.html`, `negative-stock.html`,
`js/lowStockData.js`, `js/negativeStockData.js` — none of these should exist, per the
review's own conclusion.

## 7. Lessons Learned / Notes for the Stock Movement Register

1. **"Is this genuinely a different report, or a preset of one that already exists?" is
   now a standing question to ask before writing any new report** — not just for
   Inventory Reports. This review's own method (compare data source, columns, shell
   composition, and ask whether the difference is only a filter predicate) generalizes to
   Customer/Supplier Reports (14B.5/14B.6) too.
2. **The Stock Movement Register is very likely a genuine, separate, ERP-sourced report**
   — it is a dated transactional listing (`stock_ledger` rows over time), categorically
   different in shape from Current Stock's point-in-time snapshot (no BI equivalent
   exists for a transaction history the way `getItemMetricsSnapshot()` covers current
   balances). It should very likely reuse `js/stockRegisterData.js` directly rather than
   need a new provider file — but confirm that shape-fit against the actual need before
   writing it, the same discipline this review just applied.
3. **Query-param-driven presets into a shared screen are now a precedented pattern** for
   "same report, different starting filter" — reusable for a future case that fits the
   same shape (identical data/columns/shell, differing only by a predicate), without
   re-deriving the design from scratch.

**Per instruction: STOP here.** Waiting for review/approval before continuing to the
Stock Movement Register (the last piece of 14B.4).
