# 0004. Reporting Data Access Strategy

Status: Accepted

## Context

Milestone 14A's own audit (this session) confirmed the Reporting Platform Foundation
(`js/services/reporting/`) contains zero data access and zero business logic, by design —
it is pure registry/contract/lifecycle/shell/print/export infrastructure. Its
`contracts/reportContract.js` already declares two `REPORT_DATA_SOURCES` values,
`ERP` and `BUSINESS_INTELLIGENCE`, but they are metadata only: 14A wires no actual data
access for either.

The Milestone 14B readiness walkthrough performed during that same audit (using Sales
Register as the worked example) surfaced a real gap this ADR exists to close before 14B
starts: Business Intelligence's own `getXSummary()` functions
(`business-intelligence-platform.md` §2's layer diagram — Data Loaders → Metrics →
Calculators → Aggregators → Insight Models → APIs) return company-wide **aggregates and
rankings**, never a row-level transaction listing. A Sales Register (or a Purchase
Register, or a detailed Stock Report) needs a dated, filtered, potentially paginated list
of individual rows — a shape Business Intelligence's Frozen Architecture
(`business-intelligence-platform.md` §13: *"long-term platform contracts... extended
additively when a genuine new need arises — never redesigned, never replaced"*) was never
built to provide, and should not be bent to provide.

Without a decision now, a future report author has two easy ways to get this wrong: write
an ad hoc Supabase query directly inside each new report screen (duplicating query logic
report-by-report — the same "each domain queries ERP independently" anti-pattern
ADR-0001 already rejected for Business Intelligence, there called Option A), or reach into
Business Intelligence's own internal `metrics/`/`calculators/` to approximate row-level
data (violating both ADR-0001's compose-through-public-APIs rule and the BI Frozen
Architecture). This ADR forecloses both mistakes before either is made.

## Decision

Two sanctioned data access paths, one per `REPORT_DATA_SOURCES` value, symmetric with the
composition rule ADR-0001 already established for Business Intelligence itself:

**1. `REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE` reports consume BI exclusively through
its existing, frozen public API surface.** `businessSnapshotProvider.getBusinessSnapshot()`
or any of the six public API objects (`inventoryIntelligence`, `purchaseIntelligence`,
`salesIntelligence`, `pricingIntelligence`, `supplierIntelligence`, `businessDashboard`),
imported only from `js/services/businessIntelligence/index.js`. This is not a new rule —
it is ADR-0001's own "compose through public APIs" rule, and
`business-intelligence-platform.md` §6's own explicit sanction (*"any future consumer...
a scheduled report... should call `businessSnapshotProvider.getBusinessSnapshot()`
directly, not reimplement the five-domain composition"*), formally extended to Reports as
a named consumer type. A BI-sourced report never imports `metrics/`, `calculators/`,
`aggregators/`, or a data loader from `businessIntelligence/` directly — the identical
constraint every BI domain itself already honors toward its own siblings.

**2. `REPORT_DATA_SOURCES.ERP` reports needing row-level data no BI aggregate exposes
require a new, dedicated, read-only Reporting Data Access layer — not built in 14A, not
part of the Reporting Platform Foundation's own infrastructure, and not inside Business
Intelligence.** This layer must:

- Be **read-only** — never writes to any ERP table.
- Reuse the **same Supabase client and RLS-scoped access pattern** the existing ERP
  screens' own `js/*.js` files (`items.js`, `sales.js`, `purchases.js`, `suppliers.js`)
  already use — never a second Supabase client, never a path that bypasses row-level
  security.
- Consist of **one query function per report's own real, row-level need**, named for
  what it returns — not a speculative, generic "ERP report query engine" built ahead of a
  second real consumer needing one. Matches this codebase's own repeated discipline
  (13A–14A) of building for a real consumer, never speculatively.
- **Compose an existing ERP query before writing a new one**, if one already returns most
  of what a report needs (e.g., if `sales.js` already lists sales in a date range for
  some other purpose, a report calls that function rather than a parallel query) — the
  same "compose before duplicating" discipline ADR-0001 established for Business
  Intelligence, applied here to the ERP layer.
- **Never reach into Business Intelligence's cache or calculators** to approximate a raw
  listing. If BI already computed something a report needs, the report declares
  `dataSource: BUSINESS_INTELLIGENCE` and calls BI's real API instead of re-deriving the
  same figure from raw rows.

This ADR deliberately does **not** fix this layer's exact file location — whether it
lives under `js/services/reporting/data/` or elsewhere is a decision for whichever
milestone builds the first ERP-sourced report, informed by what that report's own real
need turns out to require. Fixing the location before a real consumer exists would be
the same premature-genericization mistake the "no speculative construction" rule above
already forecloses for the query functions themselves.

**3. A report declares exactly one `dataSource`.** A report needing both a raw ERP
listing and a BI-computed figure (e.g., rows plus a summary total) is legitimate, but its
own screen implementation must be explicit about which piece comes from which path —
never hidden behind one `dataSource` label covering both.

## Alternatives considered

**Let each report screen write its own ad hoc Supabase query inline.** Rejected: this is
exactly Option A from ADR-0001 ("Direct ERP Access... duplicates business rules, increases
maintenance, allows inconsistent results"), rejected there for Business Intelligence's own
domains. Report screens should not hold a lower bar than BI domains already do.

**Extend Business Intelligence itself to expose row-level listings** (e.g. a new
`getSalesRows()` beside `getSalesSummary()`). Rejected: violates the BI Frozen
Architecture's own "the layer diagram does not change shape" rule
(`business-intelligence-platform.md` §13) — a row-level listing is a structurally
different consumption model than any existing BI function returns. If ever wanted, it
needs its own explicit BI amendment, decided by whoever owns that platform under its own
governance procedure — not assumed by this ADR, which has no mandate to reopen a frozen
contract.

**Build a generic Reporting Data Access engine now, as part of this ADR or 14A.**
Rejected: this repository's own repeated discipline (13A–14A) is "build for a real
consumer, not speculatively." A generic engine designed before the first ERP-sourced
report actually exists risks guessing wrong about the shape genuinely needed —
14A's own Reporting Platform Foundation was itself scoped the same way (infrastructure
proven by a real, if empty, consumer — `reports.html` — never a hypothetical one).

## Consequences

- Whoever builds Milestone 14B has an approved answer to "where does my report's data
  come from" before writing a line of code — a report author's test is simply: *does
  Business Intelligence already compute this, even approximately? If yes, path 1
  (`BUSINESS_INTELLIGENCE`). Is it a raw transactional listing? Path 2 (`ERP`).*
- Business Intelligence's Frozen Architecture stays genuinely frozen — no pressure to
  bend its aggregate-shaped contracts into row-level listings it was never designed for.
- The first ERP-sourced report is also the first real consumer that decides the new data
  layer's exact shape and location — deliberately deferred here, not guessed at.
- `contracts/reportContract.js`'s `REPORT_DATA_SOURCES` field, previously "metadata only,
  no rule attached," now has a real, citable rule governing what each value obligates a
  future report's implementation to do.

## References

- `docs/architecture/ADR/0001-business-intelligence-domains-compose-through-public-apis.md`
  — the compose-through-public-APIs rule this ADR extends to Reports as a consumer type
- `docs/architecture/business-intelligence-platform.md` §2 (layer diagram), §6
  (BusinessSnapshot — "any future consumer... a scheduled report..."), §13 (Frozen
  Architecture)
- `docs/architecture/reporting-platform-architecture.md` §13 ("Source a report's data")
- `docs/architecture/ADR/0003-reporting-platform-foundation.md` — the foundation this
  ADR's two data paths plug into
- `docs/reports/milestone-14A-completion.md` §12 (remaining work for 14B)
