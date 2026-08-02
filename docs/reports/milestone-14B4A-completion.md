# Milestone 14B.4A Completion Report — Stock Register

**Status:** 14B.4A (Stock Register only) complete, as scoped. Per instruction: **STOP
here.** Current Stock, Low Stock, Negative Stock, and Stock Movement Register (the rest
of 14B.4) are not started until this report is reviewed. No commit, merge, tag, or push
has been made.

## 1. Architecture Review

One new, sanctioned platform extension this milestone: `REPORT_FILTER_KEYS.ITEM` (plus
the matching `case` in `reportFilterBar.js`) — the same additive mechanism architecture
doc §13 already documents, used a second time (the first was `PAYMENT_STATUS`, 14B.2).
Justification: the Stock Register's real need is "filter stock_ledger rows down to one
item," and none of `CATEGORY`/`SUPPLIER`/`CUSTOMER` is the right noun for that — reusing
one of them with a mismatched accessible label was judged worse than naming the control
plainly. `STATUS` is reused, unmodified, for `stock_ledger.txn_type` (Purchase / Sale /
Sale Return / Purchase Return / Manufacturing Consume / Manufacturing Produce /
Adjustment / Opening) — the same "reuse STATUS for this schema's own record-kind column"
precedent the Sales Register set for `invoices.doc_type`.

Everything else — Registry, Contract, Lifecycle, Context, Shell, Toolbar, Filter Bar,
Date Range, Print, Export — reused exactly as the first two reports already proved:
`registerStockRegisterReport()` (idempotent) → `reportRegistry.get()` →
`createReportContext()` → shell/toolbar/filter-bar composition → lifecycle-driven
`IDLE → LOADING → LOADED/ERROR` → real `triggerPrint()`/`downloadCsv()`.

`reportingPlatform.test.html`: still **67/67** after the `ITEM` key addition.

**No Business Intelligence touched.** `js/services/businessIntelligence/api/
inventoryIntelligenceApi.js` was read (not imported) to confirm no overlap: it exposes
only aggregate/insight shapes (low stock, out-of-stock, dead/slow/fast-moving, overstock,
category and reorder summaries, an inventory value model) — never a row-level
transaction listing. The Stock Register's row-level `stock_ledger` listing is a
categorically different shape, exactly the gap ADR-0004 exists to close, not a
duplication of anything BI already computes.

## 2. Data Provider Review

Per instruction, kept inside `js/stockRegisterData.js` — flat, top-level, one
provider/domain (ADR-0005), outside `js/services/reporting/`, read-only throughout.

**Confirmed this is a genuine new need, not a duplicate**: `js/items.js` already has
`getStockLedgerForBatch(batchId)`/`getStockLedgerForItem(itemId)` — both single-item/
single-batch drill-down reads for the Stock screen's own history view, neither
company-wide, dated, or paginated. Neither was force-reused (ADR-0005 §4's "check first"
rule was applied and correctly concluded "these don't fit" — the opposite conclusion from
Purchase Register's Supplier-options reuse, and that is exactly the point: check every
time, don't default either way).

Two functions, one real need each — same shape as the previous two providers:

| Function | Real need |
|---|---|
| `listStockRegisterRows(opts)` | The paginated page currently on screen |
| `listAllStockRegisterRows(filters)` | Every row matching the current filters, for CSV export — same 500-row `fetchAllPages` loop convention |

**No stock calculation duplicated.** `qty_in`/`qty_out`/`unit_cost` are read exactly as
every write path into `stock_ledger` already wrote them (`record_stock_adjustment`,
`create_sale`, `create_purchase`, the manufacturing RPCs). **Deliberately does not compute
a running balance** — `batches.qty_on_hand` is the one authoritative *current* balance
`items.js`/`stock.html` already read; a historical running balance would require an
ordered cumulative sum, which is a real, new calculation this instruction's own "do not
duplicate stock calculations" rules out building here.

**Display-only embeds, same precedent as Purchase Register**: `stock_ledger` has no
item-name or batch-number snapshot, so `items(name, unit)` and `batches(batch_no)` are
read via the same PostgREST embedding style `purchaseRegisterData.js`
(`parties(name, phone)`) and `dataReaders.js` (`batches(batch_no)`) already established —
for display only. Search/Sort stay on `stock_ledger`'s own base-table columns
(`notes`, `txn_date`, `qty_in`, `qty_out`) for the same precedent-safety reason already
disclosed for Purchase Register.

**One schema-specific detail**: `txn_date` is `timestamptz` (unlike `invoice_date`/
`bill_date`'s plain `date`), so the date-range "to" boundary is extended to
`${dateTo}T23:59:59.999` rather than a bare date string, or the last calendar day of a
range would be silently dropped.

**ADR-0005 §4 in practice, third time**: the Item filter's option list reuses
`items.js`'s own `listItemsWithStock({ limit: 500, activeOnly: true })` directly from
`stock-register.html` — already list-shaped (paginated, alphabetically sortable) — no new
function written for it, the same judgment Purchase Register made for its Supplier
filter.

## 3. Stock Register Capabilities

| Capability | Implementation |
|---|---|
| Date Range | Shared `DATE_RANGE` filter (This Month default), `timestamptz`-aware "to" boundary |
| Item filter | **New** `ITEM` filter key, populated by reusing `items.js`'s `listItemsWithStock()` |
| Transaction Type filter | Reused `STATUS` filter key — Purchase / Sale / Sale Return / Purchase Return / Mfg Consume / Mfg Produce / Adjustment / Opening |
| Search | `SEARCH` filter, scoped to `notes` (the only free-text base-table column — narrow but real, same disclosed-scope discipline as Purchase Register's bill-no-only search) |
| Payment Status | **Not declared** — no payment concept applies to a stock movement |
| Sort by column | Page-local select: Date ↑↓, Qty In (highest first), Qty Out (highest first) |
| Pagination | "Load more", same convention as both previous registers |
| Print current view | `triggerPrint()`, unchanged shared framework |
| Export filtered view | Full filtered result set via `listAllStockRegisterRows()` |

Row presentation: `createListRow()` — item name as primary text, transaction-type badge,
batch number/timestamp/unit cost/notes in `meta`, and two `.stock-chip` values for Qty In
(green-neutral, `+`) and Qty Out (warning-tinted `low` class, `−`) — the same two-value
visual convention both prior registers use.

## 4. Performance Observations

- Same one-round-trip-per-page shape (`count:'exact'` + `.range()`).
- Two embeds per query (`items`, `batches`), both single indexed FK lookups
  (`item_id`/`batch_id` are indexed via `idx_ledger_item`) — not a per-row N+1.
- `listAllStockRegisterRows()` shares the same disclosed unbounded-for-large-filters
  trade-off as both prior registers' own CSV export.
- `stock_ledger` is typically the highest-volume table in this schema (one row per unit
  of movement, not one per invoice/bill) — worth watching if a future company's data
  volume grows large; not measurable against a live seeded session in this environment.

## 5. Regression Summary

- `reportingPlatform.test.html`: **67/67**, unchanged, re-run after the `ITEM` key
  addition.
- `stock-register.html` and `reports.html`: verified headlessly (isolated Chrome profile)
  — both redirect cleanly to `index.html` unauthenticated; every new import
  (`js/stockRegisterData.js`, `js/operationalReports/stockRegister.js`,
  `stock-register.html` itself) resolves `200`; only the pre-existing `favicon.ico` 404.
- `node --check` clean on both new `.js` files, the two edited platform files, and both
  pages' inline module scripts.
- **Not run**: authenticated interactive verification (no reachable seeded Supabase
  session in this environment — same disclosed limitation as every prior milestone here).

## 6. Files Modified

**New (3):**
- `js/stockRegisterData.js` — ERP Reporting Data Access layer (ADR-0004 path 2 / ADR-0005)
- `js/operationalReports/stockRegister.js` — Report Definition + registration
- `stock-register.html` — the Stock Register screen
- `docs/reports/milestone-14B4A-completion.md` — this report

**Modified (3, all additive):**
- `js/services/reporting/contracts/reportContract.js` — `+ITEM` filter key
- `js/services/reporting/shell/reportFilterBar.js` — `+1` switch case
- `reports.html` — `+1` import, `+1` idempotent `registerStockRegisterReport()` call

**Untouched:** `js/services/businessIntelligence/**` (including
`inventoryIntelligenceApi.js`, read but not imported), `schema.sql`, `css/shared.css`,
`menu.html`, `js/items.js`, and every other business screen.

## 7. Lessons Learned / Notes for the Rest of 14B.4

1. **`ITEM` is now a reusable filter key** — Current Stock/Low Stock/Negative Stock will
   almost certainly want it too; reuse it, don't re-derive.
2. **`timestamptz` columns need an explicit end-of-day "to" boundary.** Any future report
   reading `stock_ledger` (or another timestamptz-based table) directly should carry this
   same `${dateTo}T23:59:59.999` handling forward — it is easy to silently drop the last
   day of a range otherwise.
3. **A running/point-in-time stock balance remains explicitly out of scope for a
   read-only register.** If Current Stock (14B.4B) needs "quantity on hand right now," that
   is `batches.qty_on_hand` directly (already computed, already correct) — not a
   `stock_ledger` cumulative sum. If a future report genuinely needs a historical
   point-in-time balance, that is a new, real calculation to flag and design deliberately,
   not something to fold into a listing provider.
4. **Two provider-level lessons now have three consecutive confirmations**: check
   ADR-0005's reuse rule fresh each time (this milestone concluded "no existing function
   fits" for the ledger listing itself, but "yes, reuse" for the Item filter's options,
   both in the same report) — and PostgREST embeds stay display-only until a real,
   verified need justifies filtering/sorting through one.

**Per instruction: STOP here.** Waiting for review/approval before continuing to Current
Stock, Low Stock, Negative Stock, or the Stock Movement Register.
