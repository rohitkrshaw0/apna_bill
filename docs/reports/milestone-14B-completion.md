# Milestone 14B Completion Report — Reporting Platform Operational Reports

**Status: Complete.** All six sub-milestones (14B.1–14B.6) delivered, reviewed, and
approved individually as the milestone progressed. This document is the final,
consolidated summary — superseding the earlier partial version of this same file (which
covered only 14B.1+14B.2 at the time it was written, before the remaining sub-milestones
were authorized). Full detail for each sub-milestone remains in its own report, indexed
below; release-checkpoint framing (executive summary, ADR references, architectural
validations) lives in `docs/releases/reporting-platform-operational-reports-v1.0.md`.

## Sub-Milestone Summary

| Sub-milestone | Delivered | Full report |
|---|---|---|
| **14B.1** | Reporting Data Providers — the ADR-0004 read-only ERP data-access pattern, established in practice by the first provider (`js/salesRegisterData.js`) | folded into 14B.2's own report (built together as one reviewed unit) |
| **14B.2** | Sales Register — the canonical reference implementation every later report reused the shape of | `docs/reports/milestone-14B2-completion.md`* |
| **14B.3** | Purchase Register | `docs/reports/milestone-14B3-completion.md` |
| **14B.4** | Stock Register (14B.4A), Current Stock (14B.4B), Low Stock/Negative Stock as presets (14B.4C), Stock Movement Register validated as identical to Stock Register — no new work (14B.4D) | `docs/reports/milestone-14B4A-completion.md`, `-14B4B-`, `-14B4C-`, `-14B4D-` |
| **14B.5** | Customer Ledger (reuse), Customer Purchase Profile (new, BI-sourced), Outstanding Summary (new, ERP-sourced) | `docs/reports/milestone-14B5-completion.md`, `-14B5B-` |
| **14B.6** | Supplier Ledger (reuse), Supplier Purchase Profile (new, BI-sourced via the richer Supplier Intelligence domain), Supplier Outstanding (new report, reused provider) | `docs/reports/milestone-14B6-completion.md` |

\* *The original 14B.2 completion report was written to this same file
(`milestone-14B-completion.md`) before the sub-milestone-numbered naming convention
(`milestone-14B3-completion.md` onward) was adopted for 14B.3 forward. Its content — the
architecture review, data provider review, and Sales Register capabilities — is preserved
in this document's own sections below rather than a separately-numbered file.*

## 1. Reports Implemented

12 reports registered across 8 screens. Full per-report data source, category, and
screen table: `docs/releases/reporting-platform-operational-reports-v1.0.md` ("Reports
Implemented"). Summary by group:

- **Sales**: Sales Register.
- **Purchase**: Purchase Register.
- **Inventory**: Stock Register, Current Stock, Low Stock (preset), Negative Stock
  (preset).
- **Customer**: Customer Ledger (reuse of Sales Register), Customer Purchase Profile,
  Outstanding Summary.
- **Supplier**: Supplier Ledger (reuse of Purchase Register), Supplier Purchase Profile,
  Supplier Outstanding.

## 2. Data Providers Added

Four new, narrow, read-only ERP providers, each governed by ADR-0004 (data access
strategy) and ADR-0005 (Operational Report Data Provider Pattern, written after 14B.2
established the pattern in practice and formalized before a second report could drift
from it):

- `js/salesRegisterData.js` (14B.1/14B.2) — also backs Customer Ledger.
- `js/purchaseRegisterData.js` (14B.3) — also backs Supplier Ledger.
- `js/stockRegisterData.js` (14B.4A).
- `js/customerOutstandingData.js` (14B.5) — the first customer-domain ERP read in this
  app.

No fifth provider exists. Supplier Outstanding (14B.6) reuses `js/suppliers.js`'s own
`listSuppliers()` directly — a repository audit found it already sufficient (returns
`current_balance`, already supports `sort:'balance'` and full pagination), unlike the
customer-side case where no equivalent listing function existed at all.

Five BI-sourced reports (Current Stock, Low Stock, Negative Stock, Customer Purchase
Profile, Supplier Purchase Profile) call an existing Business Intelligence public API
function directly — `inventoryIntelligence.getItemMetricsSnapshot()`,
`salesIntelligence.getSalesMetricsSnapshot()`, and
`supplierIntelligence.getSupplierMetricsSnapshot()` — with **zero new Business
Intelligence code written**.

## 3. Registry Entries

12 `ReportDefinition`s, all registered against the one shared, application-wide
`reportRegistry` (14A's own singleton, untouched). Verified directly: registering all 12
produces zero duplicate-id errors; re-registering all 12 a second time (the idempotency
every `register*Report()` function guarantees) is a no-op.

Two additive, pre-sanctioned extensions to the platform's own `REPORT_FILTER_KEYS` — the
only changes to `js/services/reporting/` anywhere in this milestone:

- `PAYMENT_STATUS` (14B.2) — reused by Sales Register, Purchase Register, and (via its
  own Balance Status framing) Outstanding Summary.
- `ITEM` (14B.4A) — reused by Stock Register.

## 4. Routing

This is a no-bundler, multi-page application — "routing" means each report either owns
its own `.html` screen (7 screens: `sales-register.html`, `purchase-register.html`,
`stock-register.html`, `current-stock.html`, `customer-purchase-profile.html`,
`outstanding-summary.html`, `supplier-purchase-profile.html`, `supplier-outstanding.html`
— 8 screens total) or points its `href` at another report's screen (Customer Ledger →
`sales-register.html`; Supplier Ledger → `purchase-register.html`; Low Stock/Negative
Stock → `current-stock.html?status=...`). `reports.html` discovers all 12 through the
registry — no report is hardcoded into the hub's own markup.

## 5. Print Support

Every one of the 8 screens wires `triggerPrint()` for real through the shared Print
Framework (`css/report-print.css`, unmodified since 14A) — the first production use;
14A's own `reports.html` never exercised this path since it had nothing to print.

## 6. Export Support

Every one of the 8 screens wires a real `onExport` through the shared Export Framework
(`downloadCsv()`, unmodified since 14A) — also the first production use. ERP-sourced
reports export the full current *filtered* result set (looping their own paginated query
in 500-row batches via a `listAllX()` function), not just the page currently loaded on
screen; BI-sourced reports export synchronously from the one already-in-memory array.

## 7. Regression Summary

**1540/1540 passing across all 22 suites in the repository**, re-verified directly
against the working tree immediately before this milestone was finalized — full
per-suite table in `docs/releases/reporting-platform-operational-reports-v1.0.md`. Every
count matches the 14A baseline exactly; zero regressions anywhere, including in suites
this milestone never touched.

## 8. Performance Summary

- ERP-sourced reports: one Supabase round trip per page (`count:'exact'` + `.range()`),
  the same shape `suppliers.js`'s own `listSuppliers()` already established.
- BI-sourced reports: one cached Business Intelligence call per report; all subsequent
  filter/sort/pagination interactions are in-memory, zero additional network cost.
- Full detail (per-report cost notes, embed/join cost, cache behavior): see "Performance
  Summary" in the release document.

## 9. Files Modified

Aggregate across all six sub-milestones:

**New application code (11 files):** 4 ERP data providers (§2), 8 report-definition
modules under `js/operationalReports/`, 8 `.html` screens (§4's 8 screens).

**Modified, additive only (4 files):** `js/services/reporting/contracts/reportContract.js`
(+2 filter keys), `js/services/reporting/shell/reportFilterBar.js` (+2 switch cases),
`reports.html` (+12 imports, +12 idempotent register calls, across six incremental
edits), `docs/architecture/ADR/README.md` (+1 index row for ADR-0005).

**New documentation:** ADR-0005, this file, 8 sub-milestone completion reports, the
release document.

**Untouched everywhere in this milestone:** `schema.sql`, `css/shared.css`, `menu.html`,
everything under `js/services/businessIntelligence/**` (read extensively for API
discovery, modified nowhere), `js/suppliers.js`, `js/sales.js`, `js/purchases.js`,
`js/items.js` (all read for precedent/reuse, modified nowhere).

## 10. Duplication Eliminated by Repository Validation

The operative discipline of this entire milestone: **every sub-milestone opened with a
schema or repository architecture validation before any code was written**, per each
turn's own explicit instruction. Four cases where that validation eliminated real,
otherwise-likely duplication:

1. **Stock Movement Register = Stock Register (14B.4D).** The original roadmap listed
   these as two separate items. `stock_ledger`'s own schema comment already reads "every
   stock movement" — the exact scope Stock Register (14B.4A) already covers, with every
   filter/sort/column a "Movement Register" would need already present. **Result: zero
   new code** — no screen, no provider, not even a second registry entry, since there was
   no distinguishing default to justify one.
2. **Low Stock / Negative Stock = Current Stock, filtered (14B.4C).** Business
   Intelligence's own `calculators/movementCalculator.js` has exactly two predicates in
   this space (`isOutOfStock`, `isLowStock`) — no separate "negative stock" concept
   exists anywhere in the platform. **Result: two lightweight `ReportDefinition`s
   pointing at the existing `current-stock.html` via a `?status=` preset — zero new
   screens, zero new providers.**
3. **Customer Ledger = Sales Register's own Customer filter (14B.5).** Sales Register
   already supported filtering by customer before Customer Ledger was ever proposed.
   **Result: one new `ReportDefinition` for discoverability, zero new screen or
   provider.** The same conclusion, independently re-derived, for Supplier Ledger against
   Purchase Register (14B.6).
4. **Supplier Outstanding needed no new provider (14B.6), unlike its customer-side
   counterpart.** `suppliers.js`'s `listSuppliers()` already returns `current_balance`
   with `sort:'balance'` support — full listing infrastructure that simply didn't exist
   yet for customers when Outstanding Summary (14B.5) was built. **Result: one new
   screen, zero new provider** — a case where the *right* answer was asymmetric with the
   customer-side report, confirmed by checking rather than assumed from naming symmetry.

Two further audits confirmed the opposite conclusion just as rigorously — that a
proposed "History" report was *not* a duplicate, once its actual data shape was checked:
Customer Purchase Profile and Supplier Purchase Profile were kept as their own,
analytically-distinct reports (order count/spend/frequency, not a transaction listing),
each sourced from the correct Business Intelligence domain for its own side of the
Customer/Supplier asymmetry (§ "Architectural Validations" in the release document).

## Remaining Work for Milestone 14C

Not scoped, designed, or started by this milestone — full list in the release document's
own "Remaining Work for Milestone 14C" section. Headline items: Executive Reports and
dashboards (explicitly out of scope per 14B's own brief), a real `requiredCapability`
authorization gate, `ReportProvider` as a wired Extension Framework capability, and any
future Business Intelligence domain work (e.g. a `customerIntelligence` domain) as a
separately-approved decision, not an automatic consequence of this release.

**Milestone 14B is complete.** No work on Milestone 14C begins until separately
authorized.
