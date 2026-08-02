# Release: reporting-operational-reports-v1.0

**Tag:** `reporting-operational-reports-v1.0` · **Branch:** `master` · **Date:** 2026-08-01

This is a release checkpoint document, not a design document. It records the state of
the repository at this tag for anyone picking up work afterward. For full design
rationale, per-sub-milestone verification detail, and every individual architecture
validation this release is built on, see `docs/reports/milestone-14B-completion.md` (the
milestone completion document) and the eight individual sub-milestone completion reports
it indexes — not repeated in full here. The living architecture reference,
`docs/architecture/reporting-platform-architecture.md`, and ADR-0004/ADR-0005 remain the
authoritative technical record for the platform and provider pattern this release builds
on.

## Executive Summary

Milestone 14B (Reporting Platform Operational Reports) is complete, committed, and
tagged. It builds the first real, operational reports on top of Milestone 14A's Reporting
Platform Foundation — **12 registered reports across 8 screens**, spanning Sales,
Purchase, Inventory, Customer, and Supplier Reports. Every report reuses the Registry,
Contract, Lifecycle, Context, Shell, Toolbar, Filter Bar, Print Framework, and Export
Framework 14A already built, unmodified except for two additive, pre-sanctioned filter-key
extensions. No report duplicates a calculation Business Intelligence or an existing ERP
service already performs. Four new, narrow, read-only ERP data providers were written;
five report definitions consume existing Business Intelligence public APIs directly with
zero new calculation; and — critically — **five of the twelve reports needed no new
screen or provider at all**, because a repository architecture audit performed before
writing each one found they were reuses, presets, or exact duplicates of a report that
already existed. Full regression: **1540/1540 passing across all 22 suites in the
repository, zero new failures, unchanged from the 14A baseline.**

## Architecture Overview

```
ERP -> Business Intelligence -> BusinessSnapshot -> Executive Command Center (13C)
ERP -> Infrastructure (Events / Diagnostics / Jobs / Audit / Extensions)
ERP -> Reporting Platform (14A) -> real reports (14B, this release) -> Reports hub
```

Every report is built the same way, first proven by the Sales Register (14B.2, the
canonical reference implementation) and then reused by every report after it:

1. A `ReportDefinition` (`js/operationalReports/*.js`) declares `id`/`title`/
   `description`/`category`/`dataSource`/`filters`/`exportFormats`/`href`, registered
   against the shared `reportRegistry` via an idempotent `register*Report()` function.
2. The report's own screen composes `shell/reportPageLayout.js`,
   `shell/reportToolbar.js`, `shell/reportFilterBar.js`, and drives
   `lifecycle/reportLifecycle.js`'s `IDLE → LOADING → LOADED/ERROR` states through
   `shell/reportStates.js` — the exact pipeline `reports.html` itself already proved
   end-to-end in 14A.
3. Data comes from exactly one of two sanctioned paths (ADR-0004): a narrow, read-only
   ERP provider (ADR-0005: one file per operational-report domain, never a shared or
   generic engine), or an existing Business Intelligence public API function, called
   directly, never through `metrics/`/`calculators/`/`aggregators/`.
4. Print (`triggerPrint()`) and CSV export (`downloadCsv()`) are wired for real on every
   report — the first production use of both; 14A's own toolbar had Export permanently
   disabled.

Two additive, pre-sanctioned extensions to the 14A foundation this release made — the
only changes to `js/services/reporting/` anywhere in 14B:

- `REPORT_FILTER_KEYS.PAYMENT_STATUS` (14B.2) — "has this been paid" is a distinct
  question from `STATUS` (this schema's own document/record-kind column).
- `REPORT_FILTER_KEYS.ITEM` (14B.4A) — "which item" has no existing key;
  `CATEGORY`/`SUPPLIER`/`CUSTOMER` are all the wrong noun.

Both follow `reporting-platform-architecture.md` §13's own documented "Add a new filter
key" procedure, written into 14A specifically to anticipate this.

## Reports Implemented

| Report | Category | Data Source | Screen |
|---|---|---|---|
| Sales Register | Sales | ERP | `sales-register.html` |
| Customer Ledger | Customer | ERP | `sales-register.html` (reuse) |
| Purchase Register | Purchase | ERP | `purchase-register.html` |
| Supplier Ledger | Supplier | ERP | `purchase-register.html` (reuse) |
| Stock Register | Inventory | ERP | `stock-register.html` |
| Current Stock | Inventory | Business Intelligence | `current-stock.html` |
| Low Stock | Inventory | Business Intelligence | `current-stock.html` (preset) |
| Negative Stock | Inventory | Business Intelligence | `current-stock.html` (preset) |
| Customer Purchase Profile | Customer | Business Intelligence | `customer-purchase-profile.html` |
| Outstanding Summary | Customer | ERP | `outstanding-summary.html` |
| Supplier Purchase Profile | Supplier | Business Intelligence | `supplier-purchase-profile.html` |
| Supplier Outstanding | Supplier | ERP | `supplier-outstanding.html` |

Verified directly: all 12 register with zero duplicate-id errors, and re-registering all
12 a second time (idempotency) throws nothing and produces no duplicates.

## ERP-Sourced Reports

Seven of the twelve (`REPORT_DATA_SOURCES.ERP`, ADR-0004 path 2): Sales Register,
Customer Ledger, Purchase Register, Supplier Ledger, Stock Register, Outstanding
Summary, Supplier Outstanding. Each reads row-level transactional or stored-balance data
no Business Intelligence aggregate was ever built to expose — dated invoice/bill/ledger
listings, or a directly-stored running balance (`parties.current_balance`).

## BI-Sourced Reports

Five of the twelve (`REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE`, ADR-0004 path 1):
Current Stock, Low Stock, Negative Stock, Customer Purchase Profile, Supplier Purchase
Profile. Each calls an existing public Business Intelligence API function directly and
performs zero calculation beyond client-side search/filter/sort/pagination over the
returned array:

- `inventoryIntelligence.getItemMetricsSnapshot()` — Current Stock, Low Stock, Negative
  Stock (one shared call; Low/Negative Stock are presets, not separate calls).
- `salesIntelligence.getSalesMetricsSnapshot()` — Customer Purchase Profile.
- `supplierIntelligence.getSupplierMetricsSnapshot()` — Supplier Purchase Profile
  (deliberately **not** `purchaseIntelligence`'s own narrower `supplierMetrics`; a
  repository audit found Supplier Intelligence, a dedicated domain composing four
  sibling domains, already returns a strict superset — see "Architectural Validations"
  below).

## Registry Reuse Decisions

Five reports share a screen and provider with another, fully-independent registry entry
existing purely for discoverability under a different report category:

| Report | Shares implementation with | Why |
|---|---|---|
| Customer Ledger | Sales Register | Sales Register's own Customer filter already is a customer ledger; "which customer" is a dynamic, per-record choice, not a presettable value |
| Supplier Ledger | Purchase Register | Same reasoning, supplier-side |

## Preset-Based Reports

Two reports are query-parameter presets of Current Stock, not separate screens:

| Report | Preset | Mechanism |
|---|---|---|
| Low Stock | `current-stock.html?status=lowStock` | Pre-selects the Stock Status filter's `lowStock` value on load; still user-changeable |
| Negative Stock | `current-stock.html?status=negativeStock` | Same mechanism, `negativeStock` value |

`current-stock.html` reads the `status` query param once, pre-seeds its filter state and
the corresponding `<select>`'s DOM value, and adapts its page title/crumb/log
messages/CSV filename accordingly — no other behavioral branch exists between the three
entry points.

## Reused Screens

- `sales-register.html` — serves both Sales Register and Customer Ledger.
- `purchase-register.html` — serves both Purchase Register and Supplier Ledger.
- `current-stock.html` — serves Current Stock, Low Stock, and Negative Stock.

**Zero new screens for these five report registrations.**

## Reused Providers

- `js/salesRegisterData.js` — also backs Customer Ledger (via its existing `partyId`
  filter).
- `js/purchaseRegisterData.js` — also backs Supplier Ledger (via its existing
  `supplierId` filter).
- `js/suppliers.js`'s existing `listSuppliers()` — backs Supplier Outstanding directly;
  **no new provider file was created for this report**, unlike its customer-side
  counterpart, because full listing infrastructure (including `current_balance` and
  `sort:'balance'`) already existed for suppliers and did not for customers.
- `inventoryIntelligence`, `salesIntelligence`, `supplierIntelligence` — all five
  BI-sourced reports call an existing public API function verbatim; none required any
  new Business Intelligence code.

## New Providers Created

Four, each ADR-0005-governed (one provider per operational-report domain, read-only, no
BI, no business rules, compose before duplicating):

| Provider | Backs | Real need it closed |
|---|---|---|
| `js/salesRegisterData.js` | Sales Register, Customer Ledger | A dated, filtered, paginated invoice listing — no BI aggregate exposes row-level transactions |
| `js/purchaseRegisterData.js` | Purchase Register, Supplier Ledger | Same shape, purchase bills |
| `js/stockRegisterData.js` | Stock Register | A dated, filtered, paginated `stock_ledger` movement listing |
| `js/customerOutstandingData.js` | Outstanding Summary | The first customer-domain ERP read in this app — no customer-listing function existed anywhere before this |

**No fifth provider (`js/supplierOutstandingData.js`) was created** — the architecture
audit found `suppliers.js`'s `listSuppliers()` already sufficient.

## Architectural Validations

Every sub-milestone opened with a schema or repository architecture validation before any
code was written — the operative discipline of this entire release. The three most
consequential findings:

1. **`batches.qty_on_hand` is not universally authoritative** (14B.4B) — only for
   `track_batches=true` items. Business Intelligence's own `computeItemMetrics()` already
   handles both cases correctly and is reachable through the public
   `getItemMetricsSnapshot()`; Current Stock consumes that instead of re-deriving the
   same two-path logic against raw tables.
2. **`parties.current_balance` is authoritative and RPC-maintained** (14B.5B), verified
   directly against `sale_rpc.sql`'s `create_sale` (`current_balance = current_balance +
   (grand_total - amount_paid)`, row-locked, same transaction as invoice creation) — not
   assumed by analogy. No invoice summation or ledger replay was built for either
   Outstanding report.
3. **Business Intelligence is asymmetric between Customers and Suppliers** (14B.6) — no
   `customerIntelligence` domain exists, but Supplier Intelligence (12E) does, composing
   four sibling domains into a richer per-supplier profile than the customer-side
   equivalent could offer. Supplier Purchase Profile consumes the richer domain rather
   than mirroring the customer-side report's own data source for consistency's own sake.

Two "is this actually a new report?" audits eliminated duplicate work entirely before it
was written:

- **Stock Movement Register = Stock Register** (14B.4D) — `stock_ledger`'s own schema
  comment already reads "every stock movement"; the two names describe one report.
  **Zero new code.**
- **Low Stock / Negative Stock = Current Stock, filtered** (14B.4C) — same
  `getItemMetricsSnapshot()` call, same columns, same shell; Business Intelligence's own
  `movementCalculator.js` has no separate "negative stock" concept at all. Implemented as
  two query-param presets, not two screens.

## ADR References

- **ADR-0003** (Reporting Platform Foundation) — registry shape, permissions, extension
  points; governs the platform this release builds on, unmodified.
- **ADR-0004** (Reporting Data Access Strategy) — the two sanctioned data-source paths
  every report in this release follows exactly.
- **ADR-0005** (Operational Report Data Provider Pattern, new in this release) — one
  provider per operational-report domain, flat and top-level, never nested inside
  `js/services/reporting/`, never collapsed into a shared or generic engine. Written
  after 14B.2 established the pattern in practice (`js/salesRegisterData.js`), before a
  second report could drift from it. Includes the one narrow, documented exception: a
  provider may be shared only when two reports consume the exact same immutable dataset
  with no report-specific filtering/transformation/semantics layered on top.

## Regression Summary

**1540/1540 passing across all 22 suites in the repository** — re-verified directly
against the working tree via `python -m http.server` + headless Chrome `--dump-dom`, this
repository's own documented zero-build-step method, immediately before this release was
tagged.

| Suite | Result |
|---|---|
| `audit/audit.test.html` | 62/62 ✅ |
| `businessIntelligence/businessDashboard.test.html` | 40/40 ✅ |
| `businessIntelligence/businessIntelligence.test.html` | 128/128 ✅ |
| `businessIntelligence/pricingIntelligence.test.html` | 80/80 ✅ |
| `businessIntelligence/purchaseIntelligence.test.html` | 95/95 ✅ |
| `businessIntelligence/salesIntelligence.test.html` | 90/90 ✅ |
| `businessIntelligence/supplierIntelligence.test.html` | 59/59 ✅ |
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
| `jobs/jobEngine.test.html` | 54/54 ✅ |
| `reporting/reportingPlatform.test.html` | 67/67 ✅ |
| `ui/forms/forms.test.html` | 80/80 ✅ |
| `ui/uiFoundation.test.html` | 99/99 ✅ |
| **Total** | **1540/1540 ✅** |

Every count matches the `reporting-platform-foundation-v1.0` (14A) baseline exactly —
confirming 14B introduced no regression anywhere, including in suites it never touched
(Business Intelligence, Data Exchange, Audit, Events, Jobs, Extensions, UI Foundation,
Forms). `node --check` was also re-run against every new/modified `.js` file and every
affected page's inline `<script type="module">` body across all six sub-milestones,
confirming no parse error anywhere.

Report registration verified separately (not part of the suite above, since it requires
DOM + the real `reportRegistry` singleton rather than an isolated test instance): all 12
`ReportDefinition`s register with zero duplicate-id errors, and idempotent re-registration
of all 12 a second time is a no-op, as designed.

## Performance Summary

- **ERP-sourced reports** (7 of 12): one Supabase round trip per page,
  `count:'exact'` + `.range()`, the same shape `suppliers.js`'s own `listSuppliers()`
  already established. Display-only PostgREST embeds (`parties(name, phone)`,
  `items(name, unit)`, `batches(batch_no)`) add a single indexed foreign-key join, not a
  per-row N+1.
- **BI-sourced reports** (5 of 12): one cached Business Intelligence call per report,
  cheaper per-interaction than the ERP shape (all filtering/sorting/pagination is
  in-memory after the one call) at the cost of loading the full result set up front.
  Supplier Purchase Profile's own call is the most expensive of the five (Supplier
  Intelligence composes four sibling snapshots), but each sibling snapshot is
  independently cached, so repeat loads within a cache window cost nothing extra.
- **CSV export**: ERP-sourced reports loop their own paginated query in 500-row batches
  (`listAllX()` functions) to export the full filtered result, not just the loaded page;
  BI-sourced reports export synchronously from the already-in-memory array, no extra
  round trip.
- Not measured against a live, seeded Supabase session anywhere in this release — no
  reachable authenticated environment exists in the environment these six sub-milestones
  were built in, the same disclosed limitation every milestone in this platform (13A
  onward) has recorded.

## Known Limitations

- **No authenticated interactive verification anywhere in this release** — every
  screen was verified via the unauthenticated-redirect method (13A onward) plus headless
  DOM/console/network inspection, never against real, seeded company data.
- **Purchase Register / Supplier Ledger search is Bill No only** — `purchases` has no
  supplier name/phone snapshot the way `invoices` does; filtering/sorting through the
  display-only `parties` embed was deliberately not attempted (unverified technique in
  this codebase). Disclosed in `docs/reports/milestone-14B3-completion.md`.
- **Customer Purchase Profile and Supplier Purchase Profile cover only customers/
  suppliers with activity in the trailing 365 days** — both `computeCustomerMetrics()`
  and the Supplier Intelligence chain compose data explicitly scoped to "purchase-history
  analysis, not a master directory." A registered customer or supplier with zero recent
  activity will not appear in either report. Surfaced on-screen in both, not hidden.
  Full customer/supplier directories remain `sale.html`/`purchase.html`'s own
  quick-add flows and `suppliers.html`'s own management screen — untouched by this
  release.
- **Supplier Outstanding has no Balance Status filter** — `listSuppliers()` has no such
  parameter, and this release neither modified that function nor faked server-side
  filtering via a capped result set. Balance status is shown per row as a badge, not
  filterable.
- **No authorization enforcement anywhere** — `requiredCapability` remains carried,
  validated, and unenforced on every one of the 12 reports, unchanged from 14A's own
  disclosed gap (ADR-0003). No report in this release should be treated as
  access-controlled.
- **Up to 500-row caps on a few filter-option lists** (e.g. Item/Customer/Supplier
  dropdowns) where an existing list function was reused without its own upper bound —
  disclosed per-report in the individual sub-milestone completion reports; not expected
  to matter at this application's realistic single-shop scale.

## Lessons Learned

- **"Is this a new report, a reuse, or a preset?" must be asked before every report, not
  assumed from the roadmap's own naming.** Applied six times across this release (Sales/
  Customer, Purchase/Supplier Ledgers, Stock Register/Movement Register, Current
  Stock/Low/Negative Stock), producing three different correct answers (full reuse, preset,
  and — once — a conclusion that a listed item was not a distinct report at all).
- **Repository reality overrides symmetry, in both directions.** Where infrastructure
  already existed for one side of a Customer/Supplier pair but not the other
  (Outstanding), the correct implementations differed (new provider vs. reused
  provider). Where Business Intelligence itself was asymmetric (no Customer Intelligence,
  but a dedicated Supplier Intelligence domain), the correct data source differed too.
  Assuming symmetry either direction would have produced either a missed opportunity
  (using the narrower Purchase Intelligence source for suppliers) or unnecessary work
  (building a customer-side domain that doesn't exist).
- **ADR-0004's own test — "does BI already compute this, even approximately?" — resolved
  every data-source decision correctly**, including two genuinely non-obvious cases
  (Current Stock, where the answer required checking an internal-only calculator's logic
  and finding it was reachable through a public snapshot function instead of the obvious
  narrower one; Supplier Purchase Profile, where two different BI domains both technically
  "compute this," and the richer one was correct).
- **Presentation-level bucketing of an already-computed figure (Payment Status, Stock
  Status, Balance Status) is a durable, repeatable pattern** — used four times across
  this release, always a label chosen from existing numbers, never a new number.

## Remaining Work for Milestone 14C

Not scoped, designed, or started by this release:

- **Executive Reports and dashboards** — explicitly out of scope for 14B per its own
  brief's stop conditions; belongs to 14C.
- **A real authorization gate for `requiredCapability`** — still undesigned; needs an
  actual roles/permissions model this application does not yet have (unchanged from 14A).
- **`ReportProvider` as a real Extension Framework capability** — still deferred; wire it
  if/when a real extension needs to contribute a report definition.
- **Column visibility and true sortable-column-headers** — no consumer has needed either
  yet, and this app's UI kit has no such primitive; build only if a future report's real
  need demands it.
- **A running/point-in-time stock balance** for a future report that might need one —
  deliberately not built anywhere in 14B (`batches.qty_on_hand` is a current snapshot,
  not historical); would be a genuine new calculation requiring its own design.
- Any further Business Intelligence domain work (a `customerIntelligence` domain, should
  a future report's real need ever justify one) is a separately-approved BI-platform
  decision, not an automatic consequence of this release.
