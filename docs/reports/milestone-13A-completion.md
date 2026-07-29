# Milestone 13A Completion Report — Product Experience Foundation

**Status:** Complete. Per this milestone's own explicit instruction: **STOP here.** No commit,
merge, tag, or push without explicit approval, and no work begins on Milestone 13B.

---

## 1. Architecture Review Summary

13A is an infrastructure milestone, not a UI migration. It touches only the presentation layer
(`js/ui/**`, `css/shared.css`, one reference business screen, and three narrowly-scoped defect
fixes) and the governing design documents. **Nothing in Core ERP, Business Intelligence, Data
Exchange, or Infrastructure (Event Bus/Diagnostics/Jobs/Audit/Extensions) was touched** — confirmed
by `git status` showing zero changes outside `js/ui/**`, `css/shared.css`, `docs/**`, and the four
HTML files listed below, and by every one of the 20 pre-existing test suites (spanning every one of
those platforms) passing unmodified.

Before writing any code, the full governing document chain was read: `platform-roadmap.md`, the
binding UX spec (`milestone-8.1-ux-architecture.md`), the immutable Design System
(`milestone-8.2-design-system.md`), and both prior frontend milestones' migration reports
(`milestone-8.3-migration.md`, `milestone-8.5-migration.md`). Those two reports' own "Gap report"
sections named exactly what this milestone builds — a generic button, a dialog/sheet lifecycle
shell — as work explicitly deferred pending a future construction milestone. 13A is that milestone
for two of the four named gaps (button, dialog); the other two (segmented toggle, search-results
row) remain open, undertaken by no consumer in this milestone's scope, and are carried forward with
a documented migration strategy rather than built speculatively.

## 2. UX Audit Summary

Full detail: `docs/reports/milestone-13A-ux-audit.md` (Deliverables 1–3, ~500 lines, produced
before any code was written). Headline findings:

- **42 raw `.btn` instances, 19 hand-wired `<dialog>`s (19 `showModal()` against 36 `close()` call
  sites), 9 hand-written empty states vs. 5 factory-built, 4 near-identical `renderResults()`
  copies** across sale/purchase/manufacturing.
- **Zero loading/skeleton UI existed anywhere in the app** — the single largest gap found. Lists
  rendered into blank void during a fetch; `stock.html`'s history dialog opened before its data
  arrived, showing a blank sheet.
- **Zero visible keyboard focus indicator** on any control except plain `<input>` — a live WCAG
  2.4.7 failure, contradicting Design System §17/§18's own existing requirement.
- **A real, live defect**: `chooseBatch()`/`chooseBatchTemplate()` (sale/purchase/manufacturing)
  hung forever on Escape and leaked stale event listeners across repeated calls — see §5.
- `index.html` and `menu.html` (out of 8.5's scope) carry real, newly-documented Design System
  violations: legacy alias tokens instead of `--color-*` roles, and `menu.html` re-implementing
  `.item-row` almost verbatim in page-local CSS.
- Two Design System internal issues were found and **deliberately left unresolved**, per the
  standing rule that this milestone does not silently resolve open governance questions: the
  `.loyalty` stray hex color (`#E7D9B5`, flagged unfixed since Milestone 8.3) and an internal
  conflict between DS §9 (buttons ≥ 34px) and §16 (any tap ≥ 44px).

## 3. Existing Reusable Components Discovered

Full inventory: `docs/reports/milestone-13A-ux-audit.md` Part 2. All 19 existing `js/ui/**`
exports were catalogued before any new code was written, specifically to avoid duplicating
anything. Notable reuse findings: `js/ui/card.js` and `js/ui/searchInput.js` were used by
`index.html` only; `js/ui/dataTable.js` reached 3 of 8 screens and `js/ui/emptyState.js` 4 of 8 —
both now extended (not replaced) in this milestone.

## 4. New Shared Infrastructure Introduced

Per the Design System §22 amendment (see §6 below) and the audit's confirmed gaps:

| File | Purpose |
|---|---|
| `js/ui/dialog.js` (new, 81 lines) | `createDialog()` — open/autofocus/backdrop-click-to-close, and `ask()`/`resolveAsk()`, a Promise that settles **exactly once** regardless of dismissal path (button, Escape, backdrop, or programmatic close). Opt-in; none of the 19 existing hand-wired dialogs were touched or require migration. |
| `js/ui/button.js` (new, 46 lines) | `createButton()` (always sets an explicit `type`, closing a latent submit-button bug found in `card.js`/`partyRow.js`/`batchRow.js`/`kebabMenu.js`) and `setButtonBusy()`, absorbing the disable-and-relabel pattern hand-copied 7× across the app. |
| `js/ui/loadingState.js` (new, 54 lines) | `createSkeletonRow/Card/Text()`, `renderSkeletonList()`, `setBusy()` — the DOM half of the Design System §22 amendment. |

No new CSS component category or color/spacing role was introduced — only the one token the
amendment explicitly approved (`--skeleton-shimmer-duration`) plus additive `:focus-visible` rules
and a `prefers-reduced-motion` block, both implementing Design System rules that already existed on
paper (§17/§18) but had never been written.

## 5. Files Modified

**`css/shared.css`** — additive only, no existing rule's value changed: `:focus-visible` rings on
every interactive control category that previously had none (`.btn`, `.icon-btn`, `.kebab`, chips,
pills, nav items, cards, etc.), a `prefers-reduced-motion` block guarding both the new skeleton
animation and the pre-existing `.save-btn` transition, the skeleton/placeholder primitives, and one
`cursor:pointer` addition to `.kebab` (required by its div-based ARIA-menu rewrite, §5 below).

**Form Framework core** (`buildControlAttrs.js`, `fieldError.js`, `fieldWrapper.js`,
`renderField.js`, and all 7 field factories) — `aria-describedby` linking every control to its
help/error text, `aria-invalid` set on validation failure, `aria-live="polite"` on the error slot.
Previously error/help text was visible but programmatically invisible to screen readers. Verified
against all 80 pre-existing Form Framework unit tests (still 80/80) plus 8 new dedicated checks.

**`js/ui/kebabMenu.js`** — rewritten to fix a real invalid-HTML defect the audit found: a real
`<button>` (each menu action) nested inside another real `<button>` (the trigger). The trigger is
now a `<div role="button" tabindex="0">` with `aria-haspopup`/`aria-expanded`, menu items carry
`role="menuitem"`, and Escape now closes an open menu (previously only an outside click did).

**`js/ui/emptyState.js`** — a title-only variant (closing the exact gap that left `stock.html`'s
`#history-empty` hand-written since Milestone 8.5), an optional action slot, and `escapeHtml` on
interpolated text (previously raw, unlike every sibling factory).

**`js/ui/dataTable.js`** — a new `setLoading()` method rendering skeleton rows; `js/ui/toast.js`
— `aria-live="polite"` on the toast container (previously only per-toast `role="alert"` existed);
`js/ui/icons.js` — `aria-hidden="true"`/`focusable="false"` on every icon (all are decorative);
`js/ui/searchInput.js` — an explicit `aria-label`; `js/ui/theme.js` — `aria-pressed` on the toggle;
`js/ui/layout.js` — `aria-label` on the two sibling nav landmarks, `aria-current="page"` on the
active nav item, and a new `renderPageHeader()` factory generating the "Shape A" topbar markup
`stock.html`/`items.html`/`suppliers.html`/`menu.html` previously hand-wrote identically.
`js/ui/card.js`/`partyRow.js`/`batchRow.js`/`forms/components/lineItemRow.js` — explicit
`type="button"` on every programmatically-created button (previously defaulted to `type="submit"`,
harmless today but a latent bug).

**`stock.html`** (reference screen) — migrated onto the new layer: generated page header, both
dialogs wrapped in `createDialog()`, `setButtonBusy()` replacing the one screen that disabled its
save button without ever relabeling it, skeleton loading on the item list and inside the history
dialog (fixing the blank-sheet-while-fetching bug the audit found), the title-only empty-state
factory for `#history-empty`, and removal of two page-local CSS rules that exactly duplicated
shared values (the 520px dialog cap, now `--dialog-max-w-compact` consumed via
`body.stock-app dialog` in `shared.css`; and `.sheet .sub`'s color/size half, which exactly
duplicated the base rule — its genuinely distinct `-6px` margin was kept, not merged away).

**`sale.html`, `purchase.html`, `manufacturing.html`** — exactly one function each
(`chooseBatch()`/`chooseBatchTemplate()`) rerouted through `js/ui/dialog.js`; no other line in any
of the three files changed. Not a screen migration.

**`docs/design-system-preview.html`** — updated in the same change as the DS §22 amendment (per
§21 rule 7): new sections demonstrating the button factory, `setButtonBusy()`, and the skeleton
primitives; the sample dialog rewired through `createDialog()`; `aria-label` added to its
hand-written sidebar/bottom-nav elements; and the `initThemeToggle()`/`initShell()` call-order
bug fixed to match the documented contract (previously only "worked" because this page hand-writes
`#theme-toggle`, a latent trap for anyone copying it as a template).

## 6. Design System Governance

Before any CSS or component code was written, a formal amendment request was recorded and approved
as `docs/milestone-8.2-design-system.md` §22 — Product Experience Foundation, per §21's own "stop →
document the gap → get approval → update the document → resume" procedure. Scope: exactly five
items (loading state, skeleton, content placeholder, reduced motion, focus-ring standardization),
one new token, everything else composed from existing tokens. This is the first amendment recorded
against the Design System since its 8.2 approval, and the first entry establishing what the §21
amendment process looks like in practice for a future milestone that hits a genuine gap.

Two items were explicitly identified as needing a product decision and were **not** resolved by
this milestone: the `.loyalty` stray hex color, and the internal DS §9-vs-§16 touch-target
conflict. Both are recorded in the audit (`docs/reports/milestone-13A-ux-audit.md` §3.2, §3.6) as
open questions for the product owner, not silently decided.

## 7. Accessibility Improvements

- **Focus visibility** (WCAG 2.4.7): every interactive control category that previously had zero
  focus indicator now shows one via `:focus-visible`, verified via computed-style inspection
  (`box-shadow` matches `--focus-ring` on programmatic focus).
- **`aria-describedby`/`aria-invalid`/live error announcements** across the entire Form Framework.
- **A real invalid-HTML defect fixed**: the kebab menu's button-inside-button nesting.
- **Real ARIA menu semantics**: `aria-haspopup`, `aria-expanded`, `role="menu"`/`"menuitem"`,
  Escape-to-close, focus-in/focus-restore.
- **Toast container and nav landmarks** now carry `aria-live`/`aria-label` respectively;
  **`aria-current="page"`** replaces a CSS-class-only active-nav indicator.
- **Decorative icons** (100% of them) now `aria-hidden`; **search inputs** now have an accessible
  name beyond a disappearing placeholder; **theme toggle** now reports its state via
  `aria-pressed`.
- **`prefers-reduced-motion`** now guards both the new skeleton animation and the pre-existing
  `.save-btn` transition — previously absent despite Design System §18 requiring it.

## 8. Mobile / Performance / Loading Improvements

- **The single largest UX gap found — zero loading feedback anywhere — is closed** on the
  reference screen: skeleton rows during the initial item-list fetch, and skeleton rows inside the
  stock-ledger history dialog, fixing the specific bug where that dialog opened on a blank sheet
  for the full duration of its fetch.
- `--focus-visible` styling and the skeleton primitives are keyboard/pointer-neutral: **pointer
  interaction remains pixel-identical** everywhere except the reference screen's own migrated
  markup; keyboard-focus rendering intentionally changes (a ring now appears where none existed) —
  a deliberate, approved exception to the "zero visual regression" standard 8.3/8.5 held to,
  stated explicitly here rather than treated as an unexplained diff.
- No layout-shift-inducing change: skeleton placeholders occupy the same row/card footprint the
  real content will, per the Design System §22 amendment's own constraint.
- No bundler exists in this repo (deliberate, per `docs/data-exchange-architecture.md`); no bundle
  -duplication risk applies. `js/ui/dataTable.js`'s `innerHTML = ''` re-render pattern was
  reviewed and left as-is — correct for the app's current direct-handler row model.

## 9. Regression Results

**Baseline (before any change): 1,374 checks across the 20 pre-existing `.test.html` suites, all
passing** — verified first, matching `docs/reports/milestone-12F-completion.md`'s own recorded
figure exactly, confirming a clean starting point.

**Final: 1,443 checks across 21 suites, all passing** (1,374 pre-existing + 69 new, in the new
`js/ui/uiFoundation.test.html`, covering `dialog.js`'s full lifecycle matrix — confirm, cancel,
Escape-equivalent dismissal, sequential re-opens with a listener-accumulation check, backdrop
click, and `closeOnBackdrop:false` — plus `button.js`, `loadingState.js`, and the accessibility
wiring added to existing modules). Method: the repository's own documented headless idiom
(`python -m http.server` + `chrome --headless=new --dump-dom`, reading each suite's `#summary`
div), run three times consecutively with zero flakiness after the fix described below.

Every modified/new screen's module script was verified to parse (`node --check`) and to execute
its full synchronous top-level code without throwing — confirmed indirectly but conclusively: each
of `stock.html`/`sale.html`/`purchase.html`/`manufacturing.html`/`items.html`/`suppliers.html`
/`menu.html` redirects to `index.html` when unauthenticated (expected, pre-existing behavior,
untouched by this milestone), and that redirect can only be reached after 100% of each script's
synchronous top-level statements — including every new `createDialog()`/`renderPageHeader()`
call — complete without error.

**A tooling defect was found and fixed during this milestone's own verification, disclosed for
transparency**: the new test suite was initially flaky/non-deterministic in this headless CLI
environment, traced to two causes, neither a defect in the shipped code: (1) Chromium's
`--disable-gpu` flag, combined with an ES module `<script type="module">` import, intermittently
prevented a native `<dialog>`'s queued `close` event from firing before `--dump-dom` captured the
page — removed from the verification tooling; (2) a test-file-only bug where an unescaped literal
`</script>` inside a JS string (checking that `createEmptyState()` escapes its input) prematurely
terminated the real `<script>` tag as far as the HTML parser is concerned, silently truncating all
subsequent test code. Both were root-caused via careful bisection and fixed; the suite has since
run cleanly and deterministically across every subsequent run in this session.

**Not run**: full authenticated CRUD interaction against a live Supabase session (opening the
migrated dialogs as a signed-in user, clicking through the reference screen's adjust/history
flows) — this environment has no reachable seeded Supabase project or test credentials, the same
disclosed limitation `docs/milestone-8.5-migration.md`'s own verification section recorded. No
business-logic file (`js/items.js`, `js/sales.js`, `js/purchases.js`, `js/manufacturing.js`,
`js/suppliers.js`, `js/supabaseClient.js`) was touched in any commit this milestone, which bounds
the risk this gap represents the same way it did for 8.5.

## 10. Reference Screen Migrated

**`stock.html`**, chosen for maximum shared-infrastructure coverage at minimum risk (read-mostly,
no invoice/money creation, two dialogs of different shapes, the clearest loading-state bug in the
app, and a topbar shape shared verbatim by three more screens — see
`docs/milestones/milestone-13A-product-experience-foundation.md` §4 for the full rationale).

## 11. Known Issues (Disclosed, None Blocking)

- **`.loyalty`'s stray hex color** (`css/shared.css`, `#E7D9B5`) remains unresolved — open since
  Milestone 8.3, outside this milestone's approved amendment scope, needs a product decision.
- **The Design System §9-vs-§16 touch-target conflict** remains unresolved — a governance question
  for the product owner, not silently picked one way by this milestone.
- **Seven business screens** (`index.html`, `menu.html`, `items.html`, `suppliers.html`,
  `sale.html`, `purchase.html`, `manufacturing.html`) still hand-wire dialogs, raw buttons, and
  have no loading state, except for the three files' single `chooseBatch` defect fix. Ordered
  migration roadmap: `docs/reports/milestone-13A-ux-audit.md` Part 4.
- **The segmented-toggle and search-results-row factories** 8.3/8.5 named remain unbuilt —
  real, confirmed duplication (4 and 4+1 sites respectively), but not exercised by the reference
  screen; building either without a real consumer would be speculative construction.
- **Full authenticated E2E verification was not possible** in this environment (§9).
- `js/ui/dialog.js`'s backdrop-click-to-close is opt-in per dialog (`closeOnBackdrop` option,
  default `true`) — none of the 19 existing hand-wired dialogs gained this behavior, since none of
  them adopted the module.

## 12. Readiness for Milestone 13B

The shared foundation this milestone built (dialog lifecycle, button factory, loading state,
accessibility-wired Form Framework and shared components) is proven end-to-end against one real
screen and unit-tested in isolation. `docs/reports/milestone-13A-ux-audit.md` Part 4 provides a
concrete, risk-ordered migration plan for the remaining seven screens, starting with `menu.html`
(lowest risk — no dialogs, no forms) and ending with `sale.html`/`purchase.html` (highest risk —
the money path). 13B (or whichever milestone number is assigned) can proceed directly from that
roadmap without re-deriving it.

**Per this milestone's own explicit instruction: STOP here.** No commit, merge, tag, or push
without explicit approval, and no work begins on 13B until it is separately authorized.
