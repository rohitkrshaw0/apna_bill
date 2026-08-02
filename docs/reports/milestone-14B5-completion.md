# Milestone 14B.5 Completion Report — Customer Reports (Partial)

**Status:** Customer Ledger and Customer Purchase Profile complete, as directed. Per
instruction: **STOP here.** Outstanding Summary is validated (§0) but was not part of
this go-ahead — implementation awaits separate approval. No commit, merge, tag, or push
has been made.

## 0. Repository Architecture Audit (performed before writing any code, as instructed)

All three originally-proposed Customer Reports were audited against data source,
existing public API availability, existing provider reuse, and existing UI reuse before
any code was written.

| | Customer Ledger | Customer Purchase Profile (was "Customer Purchase History") | Outstanding Summary |
|---|---|---|---|
| **Data source** | ERP (`invoices`, row-level) | BUSINESS_INTELLIGENCE | ERP (`parties.current_balance`, row-level) |
| **Existing public API** | None needed — not BI-shaped | `salesIntelligence.getSalesMetricsSnapshot()` — confirmed public (returned from `createSalesIntelligenceApi()`), returns a full `customerMetrics` array | None — `metrics/customerMetrics.js`'s own header comment confirms it is "not a master customer directory" and has no balance field |
| **Existing provider reuse** | Full — `js/salesRegisterData.js`'s `listSalesRegisterRows()`/`listAllSalesRegisterRows()` already accept `partyId` | Full — no new provider; `computeCustomerMetrics()` already implements the exact per-customer profile | None — no customer-listing function exists anywhere (unlike suppliers, which already have `listSuppliers()`) |
| **Existing UI reuse** | Full — `sales-register.html`'s Customer filter already does this | None (new screen), but same shell/toolbar/pattern as Current Stock | None |
| **Verdict** | Reuse — same screen (`sales-register.html`), new Registry entry only, for discoverability under Customer Reports | New report, BI-sourced, no new provider | New report — genuinely distinct (different table, different shape); **not implemented this round** |

**Disambiguation resolved during this audit**: "Customer Purchase History," read literally,
would have been identical to Customer Ledger (the same duplicate-naming risk the Stock
Register/Stock Movement Register audit already found once). Per your direction, it was
kept as a separate, renamed report — **Customer Purchase Profile** — because it answers a
different business question (a purchasing *profile*: spend, frequency, recency) than
Customer Ledger (a transaction *history*). Proceeding required confirming Sales
Intelligence's public API already exposed the needed metrics before writing anything —
confirmed: `getSalesMetricsSnapshot()` is part of the object `createSalesIntelligenceApi()`
returns (not an internal-only helper), and its `customerMetrics` field is exactly
`computeCustomerMetrics()`'s full per-customer array.

## 1. Architecture Review

**No changes to `js/services/reporting/`** — `SEARCH` (Customer Purchase Profile) and the
full existing Sales Register filter set (Customer Ledger) already covered everything
needed. Registry, Contract, Lifecycle, Context, Shell, Toolbar, Filter Bar, Print, Export
all reused exactly as prior reports established.

`reportingPlatform.test.html`: still **67/67** (no platform file touched).

**Customer Ledger** — `js/operationalReports/salesRegister.js` gained a second
`ReportDefinition` (`customer-ledger`), `category: CUSTOMER` (vs. Sales Register's own
`category: SALES`), `href: 'sales-register.html'` — the identical, unmodified screen.
No query param, unlike Low Stock/Negative Stock: "which customer" is a dynamic,
per-record choice the existing Customer filter already makes, not a small fixed enum
worth presetting. Colocated in the same file as `salesRegisterReportDefinition` rather
than a new file, for the same reason Low Stock/Negative Stock were colocated with Current
Stock — keeping the "these share one implementation" fact visible at the file level, not
just in a comment.

**Customer Purchase Profile** — new `js/operationalReports/customerPurchaseProfile.js`
(definition only, no provider) and new `customer-purchase-profile.html`, structurally
identical to `current-stock.html`: one `BUSINESS_INTELLIGENCE` call
(`salesIntelligence.getSalesMetricsSnapshot()`), then search/sort/pagination entirely
client-side over the returned `customerMetrics` array — no figure recalculated.

## 2. Data Provider Review

**Neither report needed a new provider.**

- Customer Ledger reuses `js/salesRegisterData.js` verbatim — the Sales Register's own
  `partyId` filter is already exactly this need.
- Customer Purchase Profile reuses `salesIntelligence`'s existing public API verbatim —
  no `js/customerPurchaseData.js` was created, and none should be; `computeCustomerMetrics()`
  (internal, never imported directly per ADR-0004) already implements every figure this
  report shows, and its result is reached only through the sanctioned public entry point.

**Disclosed scope limit, carried forward rather than hidden**: `computeCustomerMetrics()`'s
own header comment states its scope is "customers who actually bought something within
the snapshot's window... not a master customer directory." Customer Purchase Profile
therefore omits any registered customer with zero sales in the trailing 365 days (Sales
Intelligence's own default lookback) — surfaced directly in the report's own description,
empty-state copy, and an on-screen scope note above the list, not silently.

## 3. Capabilities

**Customer Ledger**: identical to Sales Register (Date Range, Customer, Status, Payment
Status, Search, sort, Load-more pagination, Print, full-filtered CSV export) — because it
is the same screen.

**Customer Purchase Profile**:

| Capability | Implementation |
|---|---|
| Search | Customer name, case-insensitive substring |
| Sort by column | Page-local select: Name (A-Z), Total Sales Value (highest first), Order Count (highest first), Last Sale (most recent first), Days Since Last Sale (highest first — surfaces at-risk/inactive customers) |
| Pagination | "Load more" over the in-memory array, same mechanism Current Stock uses |
| Print current view | `triggerPrint()`, unchanged shared framework |
| Export filtered view | Synchronous CSV of the current filtered array — no extra round-trip |

Row presentation: `createListRow()` — customer name as primary text, order count/last
sale date/purchased categories in `meta`, two `.stock-chip` values (Total Sales Value,
Avg Order Value).

## 4. Performance Observations

- Customer Ledger: identical cost profile to Sales Register (one `.range()` query per
  page) — no additional cost from being independently discoverable.
- Customer Purchase Profile: one cached `BUSINESS_INTELLIGENCE` call for the whole
  report, same as Current Stock — cheaper than a per-customer query loop would have been.
- Not measured against a live Supabase session — same disclosed environment limitation as
  every prior milestone here.

## 5. Regression Summary

- `reportingPlatform.test.html`: **67/67**, unchanged.
- `customer-purchase-profile.html`, `sales-register.html`, and `reports.html` verified
  headlessly (isolated Chrome profile): all redirect cleanly to `index.html`
  unauthenticated; every new import resolves `200`; only the pre-existing `favicon.ico`
  404.
- `node --check` clean on both new/modified `.js` files and all three pages' inline
  module scripts.
- **Not run**: authenticated interactive verification (no reachable seeded Supabase
  session in this environment — same disclosed limitation as every prior milestone here).

## 6. Files Modified

**New (3):**
- `js/operationalReports/customerPurchaseProfile.js` — Report Definition + registration
  (BUSINESS_INTELLIGENCE-sourced; no data provider file)
- `customer-purchase-profile.html` — the Customer Purchase Profile screen
- `docs/reports/milestone-14B5-completion.md` — this report

**Modified (2):**
- `js/operationalReports/salesRegister.js` — `+1` `ReportDefinition`
  (`customerLedgerReportDefinition`), `+1` register function; no provider or screen
  changes
- `reports.html` — `+2` imports, `+2` idempotent register calls

**Not created (deliberately):** `sales-register.html` was not modified; no
`js/customerLedgerData.js`; no `js/customerPurchaseData.js`; no separate Customer Ledger
screen.

## 7. Outstanding Summary — Validated, Not Yet Implemented

Per the audit (§0): genuinely distinct from both reports above — different table
(`parties`, not `invoices`), different shape (one row per customer with a stored balance,
not one row per transaction), no existing function covers it (unlike suppliers, which
already have `listSuppliers()` returning `current_balance`). This would be the first
customer-domain ERP read in the app. Warrants one new, narrow, read-only provider
function when authorized — not built this round, since this go-ahead was scoped to
Customer Ledger and Customer Purchase Profile only.

## 8. Lessons Learned / Notes for Outstanding Summary (when authorized)

1. **`parties.current_balance` is the authoritative source** — same category of stored,
   RPC-maintained running total as `batches.qty_on_hand`. No BI derivation, no ledger
   replay across `invoices`/`payments` needed or wanted.
2. **`suppliers.js`'s own `listSuppliers()` is the closest existing precedent** (same
   table, same `current_balance` field, already supports `sort: 'balance'`) — not
   directly reusable (scoped to `is_supplier`, named/tested for the Supplier Management
   screen), but its shape is the template a new, narrowly-scoped customer-domain function
   should follow, the same "structurally similar, still gets its own named function"
   precedent Sales/Purchase/Stock Register already set for each other.
3. **This will be the first customer-domain provider in the app** — same "genuinely new
   need" category `js/stockRegisterData.js` and `js/salesRegisterData.js` each were,
   not a violation of any reuse rule.

**Per instruction: STOP here.** Waiting for approval before implementing Outstanding
Summary.
