# 0005. Operational Report Data Provider Pattern

Status: Accepted

## Context

ADR-0004 decided *where a report's data may come from* (its two `REPORT_DATA_SOURCES`
paths) but deliberately left *where the ERP-sourced query code itself lives* for
"whichever milestone builds the first ERP-sourced report" to decide. Milestone 14B.2 (the
Sales Register) was that report, and made that decision in practice:
`js/salesRegisterData.js`, a flat, top-level module sibling to
`sales.js`/`purchases.js`/`items.js`/`suppliers.js`.

That placement is a real decision, not an accident, and it is exactly the kind of thing
this directory's own README says is "expensive to re-derive from a milestone completion
report alone." Without writing it down now, as Milestone 14B moves on to Purchase
Register, Customer Ledger, Supplier Ledger, and Inventory Reports (14B.3–14B.6), there is
a real risk someone reaches for the *other* obvious-looking shape instead: one shared
`reportData.js` file growing a function per report, or worse, a `genericReportEngine.js`/
`queryFactory.js` built to parametrize "give me rows from table X filtered by Y" generically
across every future report. ADR-0004 already rejected that shape once, in general terms
("not a speculative, generic report query engine"); this ADR exists to make the *concrete*
per-report-module pattern explicit and binding, so that rejection survives contact with a
second, third, fourth, and fifth report.

## Decision

**Every operational report owns exactly one data provider module, named for that report,
never shared with another report.**

```
Sales Register     -> js/salesRegisterData.js
Purchase Register  -> js/purchaseRegisterData.js
Customer Ledger     -> js/customerLedgerData.js
Supplier Ledger     -> js/supplierLedgerData.js
Inventory Reports   -> js/inventoryReportData.js
```

Each module is flat and top-level under `js/`, sibling to the existing domain modules
(`items.js`, `sales.js`, `purchases.js`, `suppliers.js`) — never nested inside
`js/services/reporting/`, for the same reason ADR-0004 gives: this data-access layer is
not part of the Reporting Platform Foundation's own infrastructure, so it does not live
inside that platform's own directory. (Where several reports share one obvious business
domain — e.g. a future Stock Register and Current Stock report both reading inventory —
one provider module per *domain*, not per individual report screen, is the intended
reading of "one provider per business domain" below; the naming stays domain-shaped,
e.g. `inventoryReportData.js` serving more than one inventory report screen, rather than
multiplying into `stockRegisterData.js` + `currentStockData.js` + `lowStockData.js` for
what is really one query surface over one table family.)

Every provider module, without exception, follows these rules:

1. **Read-only.** No provider function ever calls `.insert()`, `.update()`, `.delete()`,
   or an RPC that writes. This mirrors ADR-0004's own rule verbatim; this ADR does not
   relax it.
2. **No Business Intelligence.** A provider under this pattern exists specifically for
   `REPORT_DATA_SOURCES.ERP` reports — the row-level listings BI's own aggregates don't
   expose (ADR-0004). It never imports from `js/services/businessIntelligence/**`. A
   report needing a BI-computed figure declares `dataSource: BUSINESS_INTELLIGENCE` and
   calls BI's own public API directly instead (ADR-0004 path 1) — it does not get a
   provider module under this pattern at all.
3. **No business rules.** A provider selects, filters, sorts, and paginates already-stored
   columns. It buckets an existing stored number into a label when useful (e.g. the Sales
   Register's `amount_paid`/`amount_due` → Paid/Partial/Unpaid) — that is presentation
   labeling, not calculation. It never re-derives GST, invoice totals, stock valuation, or
   any figure `gst.js`/the `create_sale`/`create_purchase` RPCs/`stock_rpc.sql` already
   computed once. If a report needs a number no existing write path already produced,
   that is a business-logic gap to raise, not something a read-only provider invents.
4. **No SQL duplication when a reusable query already exists.** Before writing a new
   query function, check whether an existing one (in `items.js`, `sales.js`,
   `purchases.js`, `suppliers.js`, or a sibling report provider) already returns most of
   what is needed, and call that instead — the same "compose before duplicating"
   discipline ADR-0004 already establishes for the ERP layer, and ADR-0001 for Business
   Intelligence before it. `js/salesRegisterData.js`'s own
   `listSalesRegisterCustomerOptions()` is deliberately a *new* function despite
   `sales.js` already having `searchParties()` — because that existing function is a
   live-typeahead search (unordered, limit-20), a genuinely different shape than "the
   full, alphabetically-ordered customer list for a filter `<select>`," the same
   distinction `suppliers.js` already draws between its own `searchSuppliers()`/
   `listSuppliers()`. Reuse the existing function when the shape actually matches; write a
   new, narrowly-named one when it does not — never force-fit one to avoid writing a
   second small function.
5. **One provider per business domain, never one generic provider or factory.** No
   `reportData.js` catching every report's queries, no `genericReportEngine.js` or
   `queryFactory.js` parametrizing "table + filters + sort" generically across reports.
   Each new report function is named for exactly what it returns
   (`listSalesRegisterRows`, `listAllSalesRegisterRows`,
   `listSalesRegisterCustomerOptions`) — the same "one query function per report's own
   real need" rule ADR-0004 already states, now extended with the concrete file-naming
   convention that keeps five-plus reports from collapsing back into one shared module by
   drift.

   **The one narrow exception**: a provider may be shared across more than one report
   only when those reports consume the exact same immutable dataset without any
   report-specific filtering, transformation, or business semantics layered on top — e.g.
   a hypothetical future Sales Register, Sales Return Register, and Sales Audit Report
   that all genuinely read the identical row set with no divergent shape. The default
   remains one report → one provider; sharing is the exception and must be justified in
   that report's own completion report or a future ADR, not assumed as the norm the
   moment two reports look superficially similar.

## Alternatives considered

**One shared `reportData.js` growing a function per report.** Rejected: a single file
accumulating `listSalesRegisterRows`, `listPurchaseRegisterRows`,
`listCustomerLedgerRows`, `listSupplierLedgerRows`, and every inventory report's own
queries side by side has no natural ownership boundary — anyone touching one report's
query risks scrolling past and half-understanding four others in the same file, and the
file's own git history stops being a useful "what changed for this report" record. Five
small, independently-readable files serve exactly the same "reuse always, no duplication"
goal without that cost.

**A generic `genericReportEngine.js` / `queryFactory.js`** (e.g. `buildReportQuery({
table, filters, sort, paginate })` parametrized across every report). Rejected outright,
for the same reason ADR-0004 already rejected "a generic Reporting Data Access engine...
as part of this ADR or 14A": different reports filter, sort, and label fundamentally
different shapes of data (an invoice listing's Payment Status bucketing has no
Purchase-Register or Stock-Register equivalent; a Customer Ledger's running-balance
column has no Sales-Register equivalent). A generic engine either grows enough
configuration knobs to become as hard to read as five small files, or forces every
report into a lowest-common-denominator query shape it doesn't actually have — the
"guessing wrong about the shape genuinely needed" risk ADR-0004 already named.

**Nest each provider inside `js/services/reporting/data/`.** Considered, since
`reporting-platform-architecture.md` §13 names this as one option and it would keep every
reporting-related file under one directory. Rejected for the same reason 14B.2 itself
decided against it: ADR-0004's own Context section states this data-access layer is "not
part of the Reporting Platform Foundation's own infrastructure," and keeping providers
physically outside that folder makes it structurally obvious (zero new files under
`js/services/reporting/` per report) that adding the fifth report never requires touching
the frozen platform.

**One provider per report *screen* even where several screens share one query surface**
(e.g. a separate file per each of Stock Register / Current Stock / Low Stock / Negative
Stock / Movement Register). Rejected: those are one business domain (inventory) read
through what is likely mostly-overlapping filters over `batches`/`stock_ledger`, not five
unrelated data shapes — splitting them into five files would be the same
over-fragmentation the first alternative above rejects, just at a finer grain. The rule is
domain-shaped (`inventoryReportData.js`), not screen-shaped.

## Consequences

- Purchase Register (14B.3) gets `js/purchaseRegisterData.js`; Customer Ledger (14B.5)
  gets `js/customerLedgerData.js`; Supplier Ledger (14B.6) gets `js/supplierLedgerData.js`;
  the Inventory Reports (14B.4) share one `js/inventoryReportData.js`. None of these is a
  free choice re-litigated per milestone — this ADR is the citable reason a future
  contributor reaches for this shape instead of a shared or generic one.
- A code reviewer can reject a PR that adds a new report's query function to an existing
  provider file (e.g. Purchase Register logic landing inside `salesRegisterData.js`) or
  that introduces any `*Engine`/`*Factory`-named generic query module, citing this ADR
  directly, without re-deriving the reasoning from scratch each time.
- `js/services/reporting/` stays exactly as 14A left it for every future 14B+ report that
  follows this pattern — no report author has a structural reason to add files there.
- If a genuine cross-report need later emerges (e.g. several reports truly needing the
  same paginated-listing helper shape), that is itself a new, real consumer decision —
  handled by a future ADR that supersedes or amends this one, not assumed here ahead of
  that need actually existing.

## References

- `docs/architecture/ADR/0004-reporting-data-access-strategy.md` — the two data-source
  paths and the "one query function per real need, not a generic engine" rule this ADR
  makes concrete and file-scoped
- `docs/architecture/ADR/0001-business-intelligence-domains-compose-through-public-apis.md`
  — the "compose before duplicating" discipline this ADR extends to report providers
  reusing existing `js/*.js` queries
- `docs/reports/milestone-14B-completion.md` — the Sales Register's own worked example:
  `js/salesRegisterData.js`, and the `searchParties()`-vs-`listSalesRegisterCustomerOptions()`
  reuse-vs-new-function judgment call this ADR generalizes
- `docs/architecture/reporting-platform-architecture.md` §13 — "Source a report's data,"
  the section this ADR's file-location decision resolves concretely
