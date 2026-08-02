# Milestone 14B.5B Completion Report — Outstanding Summary

**Status:** Outstanding Summary complete. This closes out Milestone 14B.5 (Customer
Reports) in full. No commit, merge, tag, or push has been made.

## 0. Schema Validation (performed before writing any code, as instructed)

**Question**: is `parties.current_balance` the authoritative source for a customer's
outstanding balance, or would this report need to sum invoices / replay transactions?

**Verified directly against the RPC, not assumed**: `sale_rpc.sql`'s own `create_sale`
updates `parties.current_balance` atomically, row-locked (`select ... for update`),
inside the same transaction as invoice creation:

```sql
update parties set current_balance = coalesce(cur_bal, 0) + (amt_grand - amt_paid) where id = party;
```

A search of every `.sql` file in this repository for `current_balance` returns exactly
three hits: the column definition (`schema.sql`), this update, and its mirrored
supplier-side counterpart (also inside `create_sale`) — **no other place this figure is
stored or computed anywhere in the schema.** There is no separate later-payment-recording
RPC: every `insert into payments` site is inside `create_sale`/`create_purchase`
themselves (payment recorded at invoice-creation time) or `restore_rpc.sql`'s
backup-restore path — so this column cannot drift out of sync with invoices the way a
derived or cached value might.

**No existing public service already exposes this for customers.** `suppliers.js`'s own
`listSuppliers()` is the closest precedent (same table, same `current_balance` column,
already supports `sort: 'balance'`) but is scoped and tested for `is_supplier = true` —
not directly reusable without blurring its own name/scope.

**Conclusion, per instruction**: use `parties.current_balance` directly. No invoice
summation. No transaction replay. No duplicated financial calculation. One new, narrow,
read-only provider, since no suitable public service already exists.

## 1. Architecture Review

No changes to `js/services/reporting/` — `STATUS` (reused a fourth time, for a
"Balance Status" bucket) and `SEARCH` already covered everything needed. Registry,
Contract, Lifecycle, Context, Shell, Toolbar, Filter Bar, Print, Export all reused
exactly as every prior report established. Server-side pagination (`.range()` +
`count: 'exact'`, "Load more") matches the Sales/Purchase/Stock Register convention —
this is ERP-sourced, row-level, and paginated the same way those three are, unlike the
BI-sourced reports' single-call-then-client-side-slice shape.

`reportingPlatform.test.html`: still **67/67** (no platform file touched).

## 2. Data Provider Review

New `js/customerOutstandingData.js` — flat, top-level, one provider for this one
domain (ADR-0005), the first customer-domain ERP provider in the app. Read-only
throughout: every function is a `supa.from('parties').select(...)`, nothing ever writes.

Two functions, one real need each:

| Function | Real need |
|---|---|
| `listCustomerOutstandingBalances(opts)` | The paginated page currently on screen |
| `listAllCustomerOutstandingBalances(filters)` | Every row matching the current filters, for CSV export — same 500-row `fetchAllPages` loop convention every prior provider uses |

`balanceStatusOf()` (in the report screen, not the provider) buckets the one already-stored
`current_balance` figure into Outstanding (`> 0`) / Credit (`< 0`) / Settled (`= 0`) — the
same presentation-level bucketing precedent Payment Status and Stock Status already set;
no new calculation.

## 3. Outstanding Summary Capabilities

| Capability | Implementation |
|---|---|
| Balance Status filter | Reused `STATUS` filter key — Outstanding / Credit / Settled |
| Search | Customer name or phone |
| Sort by column | Page-local select: Balance (highest first, default — biggest debtors first), Name (A-Z) |
| Pagination | "Load more", server-side `.range()`, same convention as Sales/Purchase/Stock Register |
| Print current view | `triggerPrint()`, unchanged shared framework |
| Export filtered view | Full filtered result set via `listAllCustomerOutstandingBalances()` |

Row presentation: `createListRow()` — customer name, a Balance Status badge, phone/
email/Inactive flag in `meta`, one `.stock-chip` value showing "Owes ₹X" (warning color)
or "Credit ₹X" (info color) or "—" when settled — mirroring `suppliers.html`'s own
Payable/Advance convention, with the sign read the opposite way (for a customer, positive
`current_balance` means they owe *us*, the reverse of the supplier-side convention, per
`create_sale`'s own formula vs. its mirrored supplier update).

## 4. Performance Observations

Same one-round-trip-per-page shape every ERP-sourced register uses (`count:'exact'` +
`.range()`). No joins, no embeds — `parties` alone carries every field this report needs.
Not measured against a live Supabase session — same disclosed environment limitation as
every prior milestone here.

## 5. Regression Summary

- `reportingPlatform.test.html`: **67/67**, unchanged.
- `outstanding-summary.html` and `reports.html` verified headlessly (isolated Chrome
  profile): both redirect cleanly to `index.html` unauthenticated; every new import
  resolves `200`; only the pre-existing `favicon.ico` 404.
- `node --check` clean on both new `.js` files and both pages' inline module scripts.
- **Not run**: authenticated interactive verification (no reachable seeded Supabase
  session in this environment — same disclosed limitation as every prior milestone here).

## 6. Files Modified

**New (3):**
- `js/customerOutstandingData.js` — ERP Reporting Data Access layer (ADR-0004 path 2 / ADR-0005)
- `js/operationalReports/customerOutstanding.js` — Report Definition + registration
- `outstanding-summary.html` — the Outstanding Summary screen
- `docs/reports/milestone-14B5B-completion.md` — this report

**Modified (1):**
- `reports.html` — `+1` import, `+1` idempotent `registerCustomerOutstandingReport()` call

**Untouched:** `schema.sql`, `sale_rpc.sql`, `js/suppliers.js` (read for precedent, not
modified), everything under `js/services/reporting/` and
`js/services/businessIntelligence/**`.

## 7. Milestone 14B.5 (Customer Reports) — Final Status

| Original list item | Outcome |
|---|---|
| Customer Ledger | Reuse of Sales Register — no new screen/provider |
| Customer Purchase History → **Customer Purchase Profile** (renamed) | Built, BUSINESS_INTELLIGENCE-sourced — no new provider |
| Outstanding Summary | Built, ERP-sourced — new provider (`js/customerOutstandingData.js`), the first customer-domain read in this app |

## 8. Lessons Learned / Notes for 14B.6 (Supplier Reports)

1. **This report is a near-mirror of the Supplier Management screen's own balance
   display** (`suppliers.html`'s Payable/Advance convention) — but the sign is read
   oppositely (customer positive = they owe us; supplier negative = we owe them, per
   `create_sale`'s own two update sites). Any Supplier Outstanding-shaped report should
   reuse `suppliers.js`'s own `listSuppliers()` directly (it already returns
   `current_balance` and already supports `sort: 'balance'`) rather than writing a new
   provider — unlike customers, suppliers already have full listing infrastructure.
2. **`current_balance` is now a twice-verified-authoritative pattern** (suppliers, now
   customers) for "the ERP's own running balance, never recomputed by a report." Any
   future report needing a stored running total should check for an existing column
   like this before assuming a derivation is needed.

**Milestone 14B.5 is complete.** Waiting for direction on Milestone 14B.6 (Supplier
Reports).
