# 0006. Business Analysis Report Pattern — Category and Data Provider Boundary

Status: Accepted

## Context

Milestone 14C (Business Analysis Reports) is the first Reporting Platform milestone to
build reports whose entire purpose is presenting Business Intelligence output rather than
row-level ERP transactions. A repository audit performed before any 14C code was written
found that 65 of the Business Intelligence Platform's 69 public API methods
(`docs/architecture/business-intelligence-api.md`) had zero call sites anywhere outside
`js/services/businessIntelligence/**` and its own tests — including two entire domain API
objects, `purchaseIntelligence` and `pricingIntelligence`, never imported by any screen.
14C exists to consume that surface, not to extend it.

Two decisions this milestone made are non-obvious enough, and expensive enough to
re-derive from a milestone completion report alone, to warrant their own record here, per
this directory's own criteria (introduces a genuinely new pattern; would be expensive to
re-derive).

## Decision

**1. A Business Analysis report's `category` is `REPORT_CATEGORIES.BUSINESS_INTELLIGENCE`,
never a domain category (`SALES`/`PURCHASE`/`INVENTORY`/`SUPPLIER`/`CUSTOMER`).** This
value has existed in `contracts/reportContract.js` since Milestone 14A but was consumed by
zero of the 12 Operational Reports (14B) — every one of those is a single-domain,
row-level report and correctly used a domain category. A Business Analysis report is
different by nature: it presents a Business Intelligence domain's already-computed
ranking/trend/classification, and the Reports hub should be able to distinguish "a listing
of my own records" from "an analysis of my business" at a glance. Using the reserved,
purpose-built category value for exactly the reports it was reserved for is simpler than
inventing a new one and does not touch the frozen contract.

**2. A `REPORT_DATA_SOURCES.BUSINESS_INTELLIGENCE` report gets no data provider file at
all.** ADR-0005 (Operational Report Data Provider Pattern) governs `REPORT_DATA_SOURCES.ERP`
reports only — "one provider per operational-report domain" exists to wrap a raw,
read-only Supabase query. A Business Analysis report calls an existing BI public API
function directly, per ADR-0004 path 1; there is no raw query to wrap, and creating a
pass-through file whose only job is re-exporting a BI function would be an empty
indirection layer, not a provider. Every Milestone 14C report definition module
(`js/analysisReports/*.js`) therefore contains a `ReportDefinition` and its
`register*Report()` function only — the same shape `js/operationalReports/currentStock.js`
already established for 14B's own five BI-sourced reports, now confirmed as the pattern
for an entire milestone rather than five reports within a mixed one.

**Corollary, not a new rule:** a report whose real need requires a BI answer no domain API
yet computes (this milestone found two — an ABC/Pareto classification, and a category
summary joined across more than one BI domain) is not built by composing raw ERP rows or
by joining several domains' output inside Reporting. That would violate ADR-0004's own
"never reach into Business Intelligence's cache or calculators" rule and the BI Platform's
own freeze (`business-intelligence-platform.md` §13: composing across domains that were
not built to compose together is a Business Intelligence decision, made under that
platform's own governance, not an automatic consequence of a report author's real need).

## Alternatives considered

**Category — classify each Business Analysis report under its nearest domain** (Product
Performance → `SALES`, Purchase Analysis → `PURCHASE`, etc.), matching how every 14B
report is classified. Rejected: several 14C reports are legitimately cross-domain in
spirit even when they call one domain's API (Margin Analysis reads Pricing but answers a
question every domain cares about), and classifying purely by "which API happened to
return the data" would make the Reports hub's category badges stop reliably signaling
"is this a record listing or an analysis" — the distinction users actually care about.

**Category — leave `BUSINESS_INTELLIGENCE` unused and add a new category instead** (e.g.
`ANALYSIS`). Rejected outright: `REPORT_CATEGORIES` is an open string map
(`reporting-platform-architecture.md` §4: "an open string, not enum-enforced"), so adding
one is not forbidden by the contract — but a value already exists, already means
"sourced from Business Intelligence," and has had zero consumers for two milestones.
Adding a second, near-synonymous category was rejected as needless duplication of intent.

**Data provider — write a thin `js/analysisReportsData.js` anyway, mirroring ADR-0005's
naming convention for consistency.** Rejected: ADR-0005 itself only governs the ERP path;
inventing a provider file with no query in it — every function body would be `return
someIntelligence.getX(opts)` — adds a layer with no behavior, contradicting this
codebase's own "build for a real consumer, not speculatively" discipline (ADR-0004's own
Alternatives section) and ADR-0005's explicit rejection of a generic/shared module.

## Consequences

- A future Business Analysis report (14D+) reaches for `REPORT_CATEGORIES.BUSINESS_INTELLIGENCE`
  and a bare `ReportDefinition` + `register*Report()` module without re-deriving either
  choice from scratch — this ADR is the citable reason.
- The Reports hub's category badges now carry real information: `businessIntelligence`
  means "presents already-computed intelligence," any domain category means "lists my own
  records." A code reviewer can flag a new report using the wrong one against this ADR.
- `js/services/reporting/`, `js/services/businessIntelligence/`, and ADR-0005 all remain
  exactly as they were — this ADR governs how a new report module is shaped, not a change
  to any frozen platform.
- If a genuine future need requires a BI answer that does not exist yet (an ABC
  classification; a cross-domain category join), that need is raised as a Business
  Intelligence platform decision under its own governance
  (`business-intelligence-platform.md` §13), not solved inside Reporting by this ADR's
  pattern stretched to cover it.

## References

- `docs/architecture/ADR/0004-reporting-data-access-strategy.md` — the two sanctioned data
  paths this ADR's corollary reaffirms
- `docs/architecture/ADR/0005-operational-report-data-provider-pattern.md` — the ERP-only
  pattern this ADR clarifies does not extend to BI-sourced reports
- `docs/architecture/business-intelligence-platform.md` §13 — the Frozen Architecture rule
  a cross-domain composition need would have to be raised against
- `js/operationalReports/currentStock.js` — the 14B precedent this ADR confirms as the
  general Business-Intelligence-sourced report pattern, not a one-off
- `docs/reports/milestone-14C-completion.md` — the audit that found 65 of 69 BI public API
  methods had zero consumers before this milestone
