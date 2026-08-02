# Release: reporting-business-analysis-reports-v1.0

**Branch:** `master` · **Date:** 2026-08-02

This is a release checkpoint document, not a design document. It records the state of the
repository at this milestone for anyone picking up work afterward. For full design
rationale, the repository-validation audit, and per-report detail, see
`docs/reports/milestone-14C-completion.md` (the milestone completion document) — not
repeated in full here. `docs/architecture/ADR/0006-business-analysis-report-pattern.md`
remains the authoritative technical record for the two architectural decisions this
release makes.

## Executive Summary

Milestone 14C (Business Analysis Reports) is complete. It builds 11 analytical reports on
top of the Reporting Platform (14A) and alongside Operational Reports (14B) — **11
registered reports across 8 screens**, spanning Sales, Purchase, Inventory, and
whole-company analysis. Every report is 100% Business-Intelligence-sourced: one existing
public API call, zero new calculation, zero new ERP data provider, zero changes to
`js/services/reporting/`. A repository audit found 65 of the Business Intelligence
Platform's 69 public API methods had zero consumers before this milestone — 14C is a pure
consumption layer over that already-computed intelligence, including the app's first
consumers of `purchaseIntelligence` and `pricingIntelligence`. Five roadmap candidates were
eliminated by repository validation before any code was written. Full regression:
**1540/1540 passing across all 22 suites, zero new failures, unchanged from the 14B
baseline.**

## Architecture Overview

```
ERP -> Business Intelligence -> BusinessSnapshot -> Executive Command Center (13C)
ERP -> Infrastructure (Events / Diagnostics / Jobs / Audit / Extensions)
ERP -> Reporting Platform (14A) -> Operational Reports (14B) -> Business Analysis Reports (14C, this release) -> Reports hub
```

Every 14C report follows one shape: a `ReportDefinition` (`js/analysisReports/*.js`) with
`category: REPORT_CATEGORIES.BUSINESS_INTELLIGENCE` and
`dataSource: REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE`, registered idempotently, whose own
screen composes the identical shell/toolbar/filter-bar/lifecycle pipeline 14B's
`current-stock.html` established, makes exactly one existing BI public API call, and does
nothing after that but filter/search/sort/paginate/print/export the array it received.

## Reports Implemented

| Report | Data Source | Screen |
|---|---|---|
| Product Performance Analysis | Business Intelligence (`salesIntelligence`) | `product-performance.html` |
| Sales Trend Analysis | Business Intelligence (`salesIntelligence`) | `sales-trend-analysis.html` |
| Category Sales Performance | Business Intelligence (`salesIntelligence`) | `category-sales-performance.html` |
| Purchase Analysis | Business Intelligence (`purchaseIntelligence`) | `purchase-analysis.html` |
| Margin Analysis | Business Intelligence (`pricingIntelligence`) | `margin-analysis.html` |
| Product Movement Analysis | Business Intelligence (`inventoryIntelligence`) | `product-movement-analysis.html` |
| Fast Moving Items *(preset)* | Business Intelligence (`inventoryIntelligence`) | `product-movement-analysis.html?movement=fastMoving` |
| Slow Moving Items *(preset)* | Business Intelligence (`inventoryIntelligence`) | `product-movement-analysis.html?movement=slowMoving` |
| Dead Stock Analysis *(preset)* | Business Intelligence (`inventoryIntelligence`) | `product-movement-analysis.html?movement=deadStock` |
| Inventory Investment Analysis | Business Intelligence (`inventoryIntelligence`) | `inventory-investment.html` |
| Business Performance Summary | Business Intelligence (`businessDashboard`) | `business-performance-summary.html` |

Full per-report filter/sort/API/CSV detail: `docs/reports/report-catalog.md`.

## Eliminated by Repository Validation

Five candidates were found to be duplicates or out of scope before any code was written —
full reasoning in `docs/reports/milestone-14C-completion.md` §1–2:

1. **Customer Performance Analysis** — duplicate of Customer Purchase Profile (14B.5).
2. **Supplier Performance / Contribution Analysis** — duplicate of Supplier Purchase
   Profile (14B.6).
3. **Inventory Valuation (per item)** — duplicate of Current Stock (14B.4B).
4. **ABC Analysis** — requires a new Business Intelligence calculation; deferred to a
   future BI platform decision.
5. **Cross-domain Category Performance** — requires Business Intelligence composition
   across four domains; deferred to a future BI platform decision.

**Special validation**: Product Movement Analysis was checked against the Stock Movement
Register precedent (killed in 14B.4D) and found genuinely distinct — zero column overlap,
different data source, different grain. Built, and deliberately named to avoid confusion
with the eliminated report.

## ADR References

- **ADR-0004** (Reporting Data Access Strategy) — the two sanctioned data paths every
  report in this release follows; every 14C report takes path 1 (Business Intelligence).
- **ADR-0005** (Operational Report Data Provider Pattern) — governs ERP-sourced reports
  only; not exercised anywhere in this release.
- **ADR-0006** (Business Analysis Report Pattern, new in this release) — the reserved
  `BUSINESS_INTELLIGENCE` category and the "no data provider for a BI-sourced report" rule
  every report in this release follows.

## Regression Summary

**1540/1540 passing across all 22 suites in the repository** — unchanged from the 14B
baseline. Full per-suite table: `docs/reports/milestone-14C-completion.md` §9.

## Performance Summary

Every report makes exactly one cached Business Intelligence call; all interaction after
that is in-memory. Full detail: `docs/reports/milestone-14C-completion.md` §10.

## Known Limitations

- **No authenticated interactive verification anywhere in this release** — every screen
  was verified via the unauthenticated-redirect method (13A onward) plus headless
  DOM/console/network inspection, never against real, seeded company data — the same
  disclosed limitation every milestone since 13A carries.
- **Sales Trend Analysis and Business Performance Summary have no filters** — a monthly
  series and a whole-company snapshot have nothing honest to filter; disclosed in each
  report's own definition and screen, not an oversight.
- **Product Movement Analysis covers only BI-classified items** — a normally-moving item
  is not listed (it remains visible in Current Stock); disclosed on-screen.
- **Category reports (Category Sales Performance, Inventory Investment Analysis) rest on
  the hsn_sac category proxy** — a pre-existing, disclosed Business Intelligence
  limitation, not solved by this release.
- **No authorization enforcement anywhere** — `requiredCapability` remains carried,
  validated, and unenforced on every one of the 11 reports, unchanged from 14A's own
  disclosed gap (ADR-0003).

## Remaining Work for Milestone 14D

Full list: `docs/reports/milestone-14C-completion.md` §12. Headline items: a real
authorization gate for `requiredCapability`, `ReportProvider` as a wired Extension
Framework capability, ABC Analysis and cross-domain Category Performance (both require a
separately-approved Business Intelligence platform decision), and Executive Reporting
(reserved scope, a future milestone).
