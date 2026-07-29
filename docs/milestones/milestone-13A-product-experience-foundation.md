# Milestone 13A — Product Experience Foundation: Design

## 1. Goals

Close the four gaps Milestones 8.3/8.5 documented and deliberately deferred
(`docs/milestone-8.3-migration.md` §Gap report, `docs/milestone-8.5-migration.md` §Gap report),
plus two Design System compliance failures found by re-auditing the current codebase: no visible
keyboard focus indicator on any control, and no loading/skeleton state anywhere in the app. 13A
builds the shared frontend infrastructure — not new screens, not new business features — that
13B+ will use to migrate the seven remaining business screens cheaply and consistently.

## 2. Current state (as it exists today)

Read in full before any code was written: `docs/architecture/platform-roadmap.md`,
`docs/milestone-8.1-ux-architecture.md` (the binding UX spec, §8/§13/§14), the immutable
`docs/milestone-8.2-design-system.md` (§20/§21 govern this milestone directly), the 8.3 and 8.5
migration reports, and every file under `js/ui/**` plus `css/shared.css` and all 8 business
screens (full inventory: `docs/reports/milestone-13A-ux-audit.md`).

Two facts from that reading shaped this design directly:

1. **8.3/8.5's own gap reports already named exactly what a "UX foundation" milestone should
   build** — a generic button, a dialog/sheet shell, a segmented toggle, a search-results row —
   because "building is construction, not adoption," out of scope for an adoption-only milestone.
   13A is that construction milestone.
2. **The dialog/sheet shell gap is not cosmetic.** Because no page anywhere wires a `close`/
   `cancel` listener, `chooseBatch()` (triplicated in sale/purchase/manufacturing) hangs forever
   on Escape and leaks `{once:true}` listeners across calls. A shared dialog lifecycle makes this
   class of bug structurally unrepresentable, not merely patched three times.

## 3. Non-goals (explicit)

Not built here: any business feature, any change to Core ERP/BI/Data Exchange/Infrastructure
platform code, any database schema or API change, any new screen, any migration of
sale/purchase/manufacturing/items/suppliers/index/menu beyond the one narrowly-scoped
`chooseBatch()` defect fix. Not decided here: the `.loyalty` stray-hex color
(`css/shared.css:553`, open since 8.3) and the DS §9-vs-§16 touch-target size conflict — both
recorded in the audit as open governance questions, not resolved by this milestone. Not built
here: the segmented-toggle and search-results-row factories — real, documented duplication, but
not exercised by the one reference screen (`stock.html`); building them without a consumer would
be speculative construction, so they carry a documented 13B migration strategy instead.

## 4. Key design questions answered

**Why does this milestone need a Design System amendment when DS §21 forbids new tokens?**
Because loading/skeleton states are a genuine gap `docs/milestone-8.2-design-system.md` never
covered — it audited what existed in `shared.css` at the time (8.2), and no loading UI existed
then either. Per DS §21 rule 5's own procedure, the correct move is to stop, document the gap, and
request approval before building — not invent a primitive silently. The amendment (§22, added to
the DS doc) is scoped to exactly five items and reuses `--color-surface-2`, `--r-md`/`--r-lg`,
`--space-*`, `--dur-base`, and `--ease-standard`; the only genuinely new surface is the skeleton
shimmer treatment and one keyframe.

**Why is `stock.html` the reference screen and not `sale.html`?** Sale/Purchase are the money
path with the most tangled dialog hand-off logic in the repo (`docs/reports/milestone-13A-ux-audit.md`
§1.6) — the highest-value migration target, but also the highest blast radius for a first proof
of a brand-new shared layer. `stock.html` is read-mostly, already partially on the shared layer
(`createDataTable`, `createEmptyState`), has the clearest unaddressed loading-state bug
(`openHistory()` opens before its fetch resolves), and shares its topbar shape verbatim with
items/suppliers/menu — proving the page-header factory here de-risks three more 13B migrations
at once.

**Why fix `chooseBatch()` now instead of deferring it to whichever milestone migrates
sale/purchase/manufacturing?** The fix lives entirely in `js/ui/dialog.js`, which this milestone
already builds. Routing three existing call sites through it is a few lines each and eliminates a
live hang bug; deferring it would mean either leaving a known defect in production code
unnecessarily or re-deriving the same shared-dialog design later. It is explicitly *not* a
screen migration — no other line of any of the three files changes.

**Why does adding focus rings and reduced-motion count as compliance, not amendment?** DS
§17/§18 already state these requirements in the approved document; the current CSS simply never
implemented them for anything but `input`. Applying `--focus-ring`/`--focus-border` more broadly
is executing an existing rule, traceable per DS §21 rule 6 — not adding a new one.

## 5. What changes visually

Per the approved scope: pointer-driven rendering stays pixel-identical (the 8.3/8.5 standard).
Keyboard-focus rendering is expected to change — a ring now appears on every control where none
existed. This is a deliberate, approved exception to "zero visual regression," and is called out
explicitly in the verification section of the completion report rather than treated as a diff to
explain away.

## 6. Full implementation and verification record

See `docs/reports/milestone-13A-completion.md`.
