# 0002. Shared UX Foundation Layer, Built Through a Governed Design System Amendment

Status: Accepted

## Context

Milestones 8.2/8.3/8.5 established `css/shared.css`'s token system and migrated the shared
component layer and six business screens onto it, but deliberately deferred *construction* of
several shared factories their own gap reports named as still missing: a generic button, a
dialog/sheet lifecycle shell, a segmented toggle, and a search-results row
(`docs/milestone-8.3-migration.md`, `docs/milestone-8.5-migration.md`). No milestone since then
built them, and independently, a Milestone 13A re-audit of the frontend found the app had **zero
loading/skeleton UI anywhere** and **no visible keyboard focus indicator on any control except
plain `<input>`** — the latter a direct violation of Design System §17/§18, which already mandate
one.

Building a loading-state component required something the Design System doc did not yet cover at
all: no combination of its existing surface, elevation, or motion rules expresses "content is
loading" (the closest candidate, `.empty`, means the opposite — "confirmed nothing exists"). Per
`docs/milestone-8.2-design-system.md` §21's own governance rule, a genuine gap must be stopped on,
documented, and explicitly approved before anything is built against it — not filled in silently
by whoever hits it next.

Separately, the UX audit surfaced a live defect: `chooseBatch()`/`chooseBatchTemplate()` (sale,
purchase, manufacturing) resolved their pick-a-batch Promise only from click handlers registered
`{once:true}`. Pressing Escape closed the native `<dialog>` without ever firing either handler, so
the `await` in the caller hung permanently, and the stale `{once:true}` listeners — never having
fired — stayed attached and cross-resolved the *next* call's Promise. This traced back to the same
missing-dialog-shell gap 8.3/8.5 had already flagged: no page in the app wires a `close`/`cancel`
listener on any of its 19 hand-authored dialogs.

## Decision

Two decisions, made together as Milestone 13A:

1. **A scoped Design System amendment** (`docs/milestone-8.2-design-system.md` §22) was written,
   requested, and approved *before* any CSS or component code was written, covering exactly five
   items: a loading state, skeleton, content placeholder, `prefers-reduced-motion` support, and
   focus-ring standardization. It introduces exactly one new token
   (`--skeleton-shimmer-duration`, since neither existing motion duration fits a multi-second
   ambient loop) and otherwise composes tokens the Design System already had (`--color-surface-2`,
   `--r-md`/`--r-lg`, `--space-*`, `--dur-base`, `--ease-standard`). Focus-ring standardization is
   explicitly *not* a new rule — it applies `--focus-ring`/`--focus-border`, both already defined,
   to component categories §17/§18 already say need one.

2. **A shared UX foundation layer was built in `js/ui/`**, closing the gaps named above: a dialog
   lifecycle module (`dialog.js`) whose `ask()`/`resolveAsk()` API guarantees a Promise settles
   exactly once regardless of dismissal path (button, Escape, backdrop, or programmatic close),
   eliminating the `chooseBatch()` defect class at its root rather than patching three call sites
   independently; a button factory (`button.js`) with a `setButtonBusy()` helper; and a loading
   -state module (`loadingState.js`) implementing the approved amendment. One reference screen
   (`stock.html`) was migrated onto the new layer to prove it end-to-end; the seven remaining
   screens were deliberately left for later migration, per the audit's own risk-ordered roadmap
   (`docs/reports/milestone-13A-ux-audit.md` Part 4).

The segmented-toggle and search-results-row factories 8.3/8.5 also named remain unbuilt — the
reference screen does not exercise either, and building a factory without a real consumer would be
speculative construction, not the same accountable pattern this amendment follows.

## Alternatives considered

- **Build the loading UI without a Design System amendment**, treating it as an implementation
  detail. Rejected: DS §21 is explicit that a genuine gap gets an amendment request, not a silent
  invention, and this repository's own prior milestones (8.3, 8.5) hold that line even under
  schedule pressure.
- **Patch each `chooseBatch()`/`chooseBatchTemplate()` call site independently** (three separate
  `close`/`cancel` listeners). Rejected: this was the exact shape of the original defect — logic
  duplicated three times, one copy already proven to drift/break. A shared dialog lifecycle makes
  the bug class structurally unrepresentable instead of patched three times.
- **Migrate all eight business screens in this milestone.** Rejected by explicit governance
  decision: 13A is an infrastructure milestone (build the shared foundation, prove it once), not a
  UI migration milestone; the other seven screens have no automated test coverage today, and
  migrating all of them in one pass would multiply regression risk for no additional proof value
  over migrating one representative screen.

## Consequences

- Every future dialog in the app can adopt `js/ui/dialog.js` to get Escape/backdrop/programmatic
  -close handling for free, rather than hand-wiring `showModal()`/`close()` per dialog as all 19
  existing ones still do (they remain untouched and continue working — this layer is additive and
  opt-in).
- The Design System's token set grew by exactly one token, under the same governance procedure
  8.2 itself established — future milestones needing a new primitive have a working precedent to
  follow, including what "compose existing tokens first, request approval for the rest" looks like
  in practice.
- Seven business screens still hand-wire dialogs, raw buttons, and have no loading state. The
  segmented-toggle and search-results-row gaps 8.3/8.5 named are still open. Both are deliberate,
  documented scope boundaries (`docs/reports/milestone-13A-ux-audit.md` Part 4 and "Out of scope"),
  not oversights — a future milestone picks them up against the now-real (not speculative) shared
  layer this one built.
- The `.loyalty` stray-hex color (`css/shared.css`) and the Design System's own internal §9-vs-§16
  touch-target conflict remain open, unresolved product decisions, explicitly not decided by this
  ADR or this milestone.
