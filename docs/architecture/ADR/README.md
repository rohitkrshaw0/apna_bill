# Architecture Decision Records (ADR)

This directory holds Architecture Decision Records for ApnaBill — one file per
significant, non-obvious architecture decision, recorded at the time the decision is
made, not reconstructed afterward.

An ADR is not a milestone report (`docs/reports/milestone-*-completion.md`), not a
living architecture reference (`docs/architecture/*.md`), and not a design doc
(`docs/milestones/milestone-*.md`). It is a short, permanent record of **one decision**:
what was decided, why, what alternatives were considered, and what the decision
implies for future work. Once written, an ADR is never edited to reflect information
learned later — a changed decision gets a new ADR that supersedes the old one, the same
"historical documents are never rewritten" rule `docs/architecture/platform-roadmap.md`
§9 already establishes for this repository.

## When to write one

Write an ADR when a decision:
- introduces a genuinely new architectural pattern (e.g., "a domain composes sibling
  public APIs instead of a data loader" — the pattern Milestone 12E introduced),
- deviates from an established convention for a disclosed reason,
- would be expensive to re-derive from a milestone completion report alone, or
- freezes or unfreezes part of a platform's contract (e.g.,
  `docs/architecture/business-intelligence-platform.md`'s own v2.0 "Frozen Architecture"
  declaration).

Not every milestone needs one. Routine, incremental extension of an already-established
pattern (a seventh domain following the same shape the sixth did) does not — that stays
documented in the domain's own architecture section and completion report, as it always
has been.

## Format

`NNNN-short-title.md`, sequential, zero-padded four digits (`0001-`, `0002-`, ...). Each
file:

```
# NNNN. Short Title

Status: Proposed | Accepted | Superseded | Deprecated

## Context
What situation/problem made a decision necessary.

## Decision
What was decided, stated plainly.

## Alternatives considered
What else was on the table, and why it was not chosen.

## Consequences
What this decision implies for future work -- what it makes easier, harder, or
forecloses.
```

## ADR Status

Every ADR's `Status` line must be exactly one of:

| Status | Meaning |
|---|---|
| `Proposed` | Under discussion, not yet governing anything. Code should not cite a `Proposed` ADR as justification for a design choice. |
| `Accepted` | In force. **Only `Accepted` ADRs are considered active architectural rules** — the only status this repository's own code, reviews, or other documents may cite as "why we do it this way." |
| `Superseded` | No longer in force, replaced by a later decision. An ADR marked `Superseded` **must reference the ADR number that replaces it** (e.g., `Status: Superseded by 0007`) — a `Superseded` status with no replacement reference is an incomplete record, not a valid one. |
| `Deprecated` | No longer in force, and not replaced by a newer ADR — the decision was abandoned, not superseded by a different decision. Used when a rule is retired outright rather than swapped for another. |

**Only `Accepted` ADRs are active.** `Proposed`, `Superseded`, and `Deprecated` ADRs
remain in this directory permanently (per this README's own "never rewritten" rule
above) as historical record, but none of the three governs current behavior — treat an
architecture claim sourced from a non-`Accepted` ADR as informational history, not a
current rule.

**If a new decision replaces an old one**: the OLD ADR's own `Status` line is updated to
`Superseded by NNNN` (this is the one, narrow exception to "an ADR is never edited" —
the status line itself is a live pointer, not part of the decision's own historical
record) pointing at the NEW ADR's number, and the NEW ADR's own body should reference
the old one by number too, so the supersession is discoverable from either file.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-business-intelligence-domains-compose-through-public-apis.md) | Business Intelligence Domains Compose Through Public APIs | Accepted |
| [0002](0002-shared-ux-foundation-layer-with-governed-amendments.md) | Shared UX Foundation Layer, Built Through a Governed Design System Amendment | Accepted |
| [0003](0003-reporting-platform-foundation.md) | Reporting Platform Foundation — Registry Shape, Permissions, and Extension Points | Accepted |
| [0004](0004-reporting-data-access-strategy.md) | Reporting Data Access Strategy | Accepted |

## Current status

This directory was established as of the Business Intelligence Platform's v2.0
checkpoint (Milestone 12F). ADR-0001 is the first record written here — it captures the
composition-pattern decision Milestone 12E actually made (query-ERP-directly vs.
shared-internals vs. public-API composition), recorded after the fact since the practice
did not exist yet when that decision was made, not as a general policy of backfilling
history. No other Milestone 12A–12F decision has been retroactively written up this way
— the rest remain documented inline (each milestone's own "Key design questions
answered" section in `docs/milestones/milestone-12*.md`, and each completion report's
own Reuse Audit). Future significant decisions are recorded here going forward, per
`docs/architecture/business-intelligence-platform.md` §14.
