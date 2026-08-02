# Milestone 14B.3 Completion Report — Purchase Register

**Status:** 14B.3 complete, as scoped. Per instruction: **STOP here.** Inventory Reports
(14B.4), Customer Reports (14B.5), and Supplier Reports (14B.6) are not started. No
commit, merge, tag, or push has been made.

## 1. Architecture Review

Zero changes to `js/services/reporting/` this time — the one filter-key extension
(`PAYMENT_STATUS`) 14B.2 already added covers this report too. Registry, Contract,
Lifecycle, Context, Shell, Toolbar, Filter Bar, Date Range, Print, and Export are all
reused exactly as the Sales Register (the canonical reference implementation) already
proved them out: `registerPurchaseRegisterReport()` (idempotent) → `reportRegistry.get()`
→ `createReportContext()` → `initReportShell()`/`renderReportShellSlots()` →
`createReportToolbar()`/`createReportFilterBar()` → `IDLE → LOADING → LOADED/ERROR` driven
for real on every filter/sort/"Load more" change → `triggerPrint()`/`downloadCsv()` wired
for real.

**One declared difference from the Sales Register, not an inconsistency**: the Purchase
Register's own `ReportDefinition.filters` omits `STATUS`. Purchases has no `doc_type`
column — there is no Sale/Sale Return/Quotation-like dimension for a purchase bill, so
there is nothing honest to put behind that filter. Declaring it anyway (with no real
values behind it) would be exactly the "fake feature" this platform's own toolbar
convention (14A) already rejects for Export-with-nothing-to-export; the correct move is
to not declare a filter that has no real meaning for this report, not to invent one.

`reportingPlatform.test.html`: still **67/67** (nothing under `js/services/reporting/`
changed this milestone).

## 2. Data Provider Review

Per ADR-0004 (path 2) and ADR-0005: `js/purchaseRegisterData.js`, flat, top-level, one
provider for this one report/domain, outside `js/services/reporting/`. Read-only, no BI,
no business rules (Payment Status again buckets `amount_paid`/`amount_due` — already-
stored totals `create_purchase`'s RPC wrote once — into a label, nothing recalculated).

Two functions, one real need each:

| Function | Real need |
|---|---|
| `listPurchaseRegisterRows(opts)` | The paginated page currently on screen |
| `listAllPurchaseRegisterRows(filters)` | Every row matching the current filters, for CSV export — same 500-row `fetchAllPages` loop convention `salesRegisterData.js`/`dataReaders.js` already established |

**A schema-driven asymmetry with the Sales Register, disclosed rather than hidden**:
`invoices` snapshots `party_name_snapshot`/`party_phone_snapshot`; `purchases` snapshots
only `supplier_gstin_snapshot`/`supplier_state_code_snapshot` — never a name or phone.
`listPurchaseRegisterRows()` therefore reads the supplier's name/phone via a PostgREST
embed, `parties(name, phone)`, over the existing `supplier_id` foreign key — the same
embedding style `dataExchange/xml/export/dataReaders.js` already uses
(`invoice_lines.select('*, batches(batch_no)')`), used here for **display only**.
Search and Sort deliberately stay on `purchases`' own base-table columns (`bill_no`,
`bill_date`, `grand_total`, `amount_due`) rather than filtering/ordering by the embedded
relation's column: PostgREST/supabase-js do support that (`foreignTable` ordering,
dot-path `or=` filters), but nothing in this codebase uses it yet and it cannot be
verified against a live database in this environment — introducing an unverified query
technique into a reporting layer was judged the wrong trade against a narrower, fully
precedented one. **Consequence**: Search matches Bill No only (not supplier name/phone,
unlike the Sales Register's fuller search), and there is no "Supplier Name" sort option.
Flagged here as a real, disclosed capability gap versus the Sales Register — not
something to silently work around.

**ADR-0005 §4 in practice, the other direction from 14B.2**: rather than writing a new
`listPurchaseRegisterSupplierOptions()`, `purchase-register.html` calls `suppliers.js`'s
own existing `listSuppliers({ limit: 500, activeOnly: true, sort: 'name' })` directly —
already list-shaped (paginated, alphabetically sortable), exactly the shape this filter
needs, so nothing new was written. This is the opposite conclusion from the Sales
Register's own Customer filter (which *did* need a new function, since `searchParties()`
is typeahead-shaped) — demonstrating the ADR-0005 "check first, write new only if the
shape genuinely differs" judgment going the other way when the existing function actually
fits.

## 3. Purchase Register Capabilities

| Capability | Implementation |
|---|---|
| Date Range | Shared `DATE_RANGE` filter (This Month default) |
| Supplier filter | Shared `SUPPLIER` filter, populated by reusing `suppliers.js`'s own `listSuppliers()` |
| Bill Number search | `SEARCH` filter, `bill_no` only (see §2's disclosed asymmetry) |
| Status filter | **Not declared** — no schema analog (§1) |
| Payment Status filter | Reused `PAYMENT_STATUS` filter key (Paid/Partial/Unpaid), same semantics as the Sales Register |
| Sort by column | Page-local select: Date ↑↓, Bill No, Amount, Amount Due (no Supplier Name — §2) |
| Pagination | "Load more", same convention as the Sales Register/`suppliers.html` |
| Print current view | `triggerPrint()`, unchanged shared framework |
| Export filtered view | Full filtered result set via `listAllPurchaseRegisterRows()`, same "current filtered view ≠ just the loaded page" distinction as the Sales Register |

Row presentation: `createListRow()`, one badge (Payment Status only, no Type badge since
there's no `doc_type`), supplier name/phone/date in `meta`, Amount/Due as `.stock-chip`
values — same visual language as the Sales Register and `suppliers.html`.

## 4. Performance Observations

- Same one-round-trip-per-page shape as the Sales Register (`count:'exact'` + `.range()`).
- The `parties(name, phone)` embed adds one join per query — a single indexed FK lookup
  (`supplier_id` already indexed via `idx_purchases_supplier`), not a per-row N+1; this is
  the same cost profile PostgREST embedding always has, not a new pattern of risk.
- `listAllPurchaseRegisterRows()` shares the same unbounded-for-large-filters trade-off
  already disclosed for the Sales Register's own CSV export — flagged, not silently
  assumed safe at arbitrary scale.
- Not measured against a live Supabase session — same disclosed environment limitation as
  14B.2.

## 5. Regression Summary

- `reportingPlatform.test.html`: **67/67**, unchanged.
- `purchase-register.html` and `reports.html`: verified headlessly (isolated Chrome
  profile) — both redirect cleanly to `index.html` unauthenticated, every new import
  (`js/purchaseRegisterData.js`, `js/operationalReports/purchaseRegister.js`,
  `purchase-register.html` itself) resolves `200`; only pre-existing `favicon.ico` 404s.
- `node --check` clean on both new `.js` files and both pages' inline module scripts.
- **Not run**: authenticated interactive verification (no reachable seeded Supabase
  session in this environment — same disclosed limitation as every prior milestone here).

## 6. Files Modified

**New (3):**
- `js/purchaseRegisterData.js` — ERP Reporting Data Access layer (ADR-0004 path 2 / ADR-0005)
- `js/operationalReports/purchaseRegister.js` — Report Definition + registration
- `purchase-register.html` — the Purchase Register screen
- `docs/reports/milestone-14B3-completion.md` — this report

**Modified (1):**
- `reports.html` — `+1` import, `+1` idempotent `registerPurchaseRegisterReport()` call

**Untouched:** everything under `js/services/reporting/`, `js/services/businessIntelligence/**`,
`schema.sql`, `css/shared.css`, `menu.html`, and every other business screen.

## 7. Lessons Learned / Notes for 14B.4

1. **Not every report shares every filter key.** `STATUS` was correctly omitted here
   rather than declared-but-meaningless — future reports should check their own schema
   before assuming the Sales Register's full filter set applies uniformly.
2. **Embedding (`table(name, phone)`) is now a precedented, display-only tool** for a
   report whose base table lacks a name/phone snapshot other tables (like `invoices`) do
   have. Inventory Reports' own `batches`/`stock_ledger` tables should be checked for the
   same snapshot-vs-join question before assuming either shape.
3. **ADR-0005's reuse check goes both ways** — sometimes it produces a new function
   (Sales Register's customer options), sometimes it correctly reuses an existing one
   unchanged (Purchase Register's supplier options via `suppliers.js`'s own
   `listSuppliers()`). Check the actual shape needed each time; don't default to either
   outcome.
4. **Filtering/sorting by an embedded relation's column (PostgREST `foreignTable`
   ordering, dot-path `or=` filters) remains unused in this codebase.** If Inventory
   Reports' own real need specifically requires it (e.g. sorting a Stock Register by item
   name when the base table only has `item_id`), that would be the first real consumer
   deciding whether to introduce it — informed by that report's actual requirement, not
   assumed available here.

**Per instruction: STOP here.** Waiting for approval before beginning Inventory Reports
(14B.4).
