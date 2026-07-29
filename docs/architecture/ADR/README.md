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

Status: Proposed | Accepted | Superseded by NNNN

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

## Current status

This directory exists as of the Business Intelligence Platform's v2.0 checkpoint
(Milestone 12F). No ADRs have been written retroactively for Milestones 12A–12F's own
decisions — those remain documented inline (each milestone's own "Key design questions
answered" section in `docs/milestones/milestone-12*.md`, and each completion report's
own Reuse Audit). Future significant decisions are recorded here going forward, per
`docs/architecture/business-intelligence-platform.md` §14.
