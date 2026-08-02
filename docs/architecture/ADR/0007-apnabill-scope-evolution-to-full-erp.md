# 0007. ApnaBill Scope Evolution — From Counter-First Billing to a Full ERP Platform

Status: Accepted

## Context

`docs/milestone-8.1-ux-architecture.md` §1 ("Product Philosophy"), written for Milestone
8.1 and binding for Milestones 8.2–8.6, states: *"What ApnaBill is not: it is not
accounting software, not a general ERP, not an inventory suite. It will resist features
that belong to those categories when they do not serve the counter. Those refusals are
documented, not silent (§12)."*

Milestone 15A adds `js/services/accounting/` — a double-entry Chart of Accounts, journal
contracts, and posting infrastructure. This is unambiguously "accounting software" in the
sense §1 disclaims. Per this repository's own standing rule that `milestone-8.1-ux-
architecture.md` is a binding product specification and any conflict with it must be
surfaced and decided explicitly rather than resolved silently during implementation, this
ADR is that decision record.

It is also true that the scope 8.1 describes had **already been superseded in practice, not
just in principle**, well before this milestone: 8.1 §12's own rejection R2 ("no
analytics-heavy dashboard... a chart wall raises cognitive load") was effectively reversed
by Milestones 12A–12F (the Business Intelligence Platform: five analytical domains plus a
composed dashboard) and 13C (the Executive Command Center, `dashboard.html`) — neither of
which recorded that reversal at the time. Milestone 14 (14A–14C) then added a full
Reporting Platform with 23 registered reports across both operational and business-analysis
categories. None of this was silent malice; it was scope drift that nobody stopped to
reconcile against the founding document, which is precisely the failure mode the "stop and
ask" rule exists to prevent going forward.

## Decision

**ApnaBill's scope has evolved, by a sequence of separately-approved milestones (12A
onward), from the counter-first billing tool `milestone-8.1-ux-architecture.md` specified
into a full ERP platform** — comparable in ambition to Vyapar and similar Indian SMB ERP
products — encompassing Business Intelligence, Executive Reporting, a Reporting Platform,
and now (15A) Accounting infrastructure.

Specifically:

1. **`milestone-8.1-ux-architecture.md` §1's "not accounting software, not a general ERP"
   statement is superseded**, as of this ADR, by the accumulated direction of Milestones
   12A through 15A. It no longer describes current, binding product scope.
2. **`milestone-8.1-ux-architecture.md` itself is NOT modified.** Per
   `platform-roadmap.md` §9 ("historical design documents are never rewritten to reflect
   information learned after they were written") and this directory's own README ("once
   written, an ADR is never edited... a changed decision gets a new ADR"), the historical
   record of what 8.1 decided, and why, at the time it was decided, remains intact and
   citable as history. A reader must consult this ADR (and the roadmap) to know it no
   longer governs current scope — the same discoverability path every other superseded
   decision in this repository already requires.
3. **§12's R2 rejection is retroactively noted as superseded** by this ADR, for the same
   reason: it was never formally reversed when 12A–13C made it moot, and leaving that
   unacknowledged would let a future reader cite a dead rejection as live policy.
4. **Future development follows the latest ADR and `platform-roadmap.md`, not
   `milestone-8.1-ux-architecture.md` §1/§12**, for any question of product category or
   scope boundary. The UX blueprint's *other* sections — Information Architecture,
   Navigation, per-module verdicts, the four-band layout contract, the counter-speed design
   principles (§1's principles 1–7, which are about *interaction design*, not product
   category) — are unaffected by this ADR and remain binding exactly as before. This ADR
   supersedes one product-category statement, not the UX architecture as a whole.

## Alternatives considered

**Amend `milestone-8.1-ux-architecture.md` directly** (strike the "not accounting
software" sentence, add a note). Rejected: this repository has a permanent rule that
historical milestone documents are never rewritten, precisely so a reader can always
reconstruct what was actually decided and when. Amending the source document would erase
the very tension this ADR exists to record.

**Do nothing — treat the conflict as already resolved by precedent** (12A–14C already
built BI/reporting features without anyone objecting, so 15A needs no new decision either).
Rejected: this is exactly the silent-drift pattern described in the Context section. The
standing rule requires an explicit decision when a conflict is found, not an inference from
the fact that nobody stopped the previous four milestones.

**Stop Milestone 15A and revisit product scope from first principles** before building any
accounting infrastructure. Rejected for now, per instruction: the direction toward a full
ERP is accepted as the current, intended trajectory, not an open question to re-litigate at
the start of every milestone that touches it.

## Consequences

- `milestone-8.1-ux-architecture.md` remains an accurate historical record of Milestone
  8.1's decisions and is never edited. Its §1 "not accounting software / not a general ERP"
  sentence and §12 R2 are both superseded by this ADR and must be read as historical, not
  current, when consulted.
- A future milestone proposing BI, reporting, accounting, or other "full ERP" capability no
  longer needs to individually stop and ask about the 8.1 conflict — this ADR is the
  citable resolution. `platform-roadmap.md` and the latest ADRs are the authority for
  product scope going forward.
- 8.1's *interaction-design* principles (counter speed, one obvious action per screen,
  progressive disclosure, mobile-first) are unaffected and remain the governing UX
  standard for any accounting-facing screen a future milestone (15B+) builds. This ADR is
  a scope-category decision, not a license to abandon ApnaBill's design discipline.
- The remaining §12 rejections (R1, R3–R7) are not addressed by this ADR and remain in
  force until a future milestone specifically supersedes one of them, following this same
  documented process.

## References

- `docs/milestone-8.1-ux-architecture.md` §1, §12 (R2) — the superseded statements
- `docs/architecture/platform-roadmap.md` §9 — "historical design documents are never
  rewritten," the rule this ADR's Decision item 2 follows
- `docs/architecture/ADR/README.md` — "an ADR is never edited... a changed decision gets a
  new ADR that supersedes the old one," the same discipline applied here to a non-ADR
  historical document
- `docs/reports/milestone-15A-completion.md` — records this decision as part of 15A's own
  audit trail
