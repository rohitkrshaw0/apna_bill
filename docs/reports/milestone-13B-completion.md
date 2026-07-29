# Milestone 13B Completion Report — Product Experience Migration

**Status:** Complete. Per this milestone's own explicit instruction: **STOP here.** No commit,
merge, tag, or push without explicit approval, and no work begins on Milestone 13C.

---

## 1. Screens Migrated

All seven screens named in `docs/reports/milestone-13A-ux-audit.md` Part 4's migration roadmap,
in that exact risk order:

| Order | Screen | Risk | Status |
|---|---|---|---|
| 1 | `menu.html` | Lowest | ✅ Migrated |
| 2 | `items.html` | Low | ✅ Migrated |
| 3 | `suppliers.html` | Low | ✅ Migrated |
| 4 | `index.html` | Medium | ✅ Migrated (with one approved architectural exception, §5) |
| 5 | `manufacturing.html` | Medium-high | ✅ Migrated |
| 6 | `sale.html` | Highest (money path) | ✅ Migrated |
| 7 | `purchase.html` | Highest (most tangled dialog hand-off) | ✅ Migrated |

`stock.html` (13A's reference implementation) was read for pattern reference but **not modified**
in this milestone — confirmed absent from every diff.

## 2. Shared Code Removed / Consolidated

- **19 hand-wired dialogs eliminated.** Every remaining `showModal()`/`close()` pair across all
  seven screens now routes through `js/ui/dialog.js`'s `createDialog()`. Verified by a repo-wide
  sweep: zero `.showModal()` calls remain in any of the seven screens.
- **The Goods/Service kind-toggle, hand-wired 4×** (`items.html` plus three copies inside
  `js/ui/quickAddItemDialog.js`'s shared `#dlg-quick-item` shell), **now renders from one shared
  factory**, `js/ui/segmentedToggle.js`. Fixing it once in the shared module closed all three
  `quickAddItemDialog.js` consumers (sale/purchase/manufacturing) simultaneously.
- **`renderResults()`, triplicated verbatim** (sale.html, purchase.html, manufacturing.html) **plus
  manufacturing's near-identical `renderProducedResults()`, now call one shared factory**,
  `js/ui/searchResults.js`. Each page keeps only its own price/meta formatting as a callback —
  the markup, escaping, empty-state, and create-new wiring live in exactly one place.
- **7 hand-copied disable-and-relabel busy-button implementations** (index.html, items.html,
  suppliers.html, manufacturing.html, sale.html, purchase.html; stock.html's was already fixed in
  13A) **now call `setButtonBusy()`** — including manufacturing/sale/purchase's split-span
  `.save-btn`s, via a new backward-compatible `data-busy-label` marker.
- **The "Shape A"/"Shape B"/"Shape C" topbars, hand-written on all seven screens, now come from
  one factory**, `renderPageHeader()` (`js/ui/layout.js`), extended with optional `backTitle` and
  `extraChipsHtml` to cover the firm/date-chip variants sale.html/purchase.html/manufacturing.html
  needed. `index.html`'s topbar remains its own bespoke shape (§5).
- **The local `escape()` reimplementation in `index.html`** — the one screen not already importing
  `js/ui/escape.js` — is gone; it now uses the same shared `escapeHtml` every other screen uses.
- **A CSS specificity fight removed**, not just hidden: `manufacturing.html`'s page-local
  `.search-wrap { margin-top: 12px }` fought an inline `style="margin-top:0"` override on its
  materials search-wrap. Both are gone, replaced by one `#produced-search-wrap` rule targeting the
  element that actually needs the margin — a real id the markup already had.

## 3. Duplicate Implementations Eliminated

Beyond what's listed in §2: `menu.html`'s near-full reimplementation of `.item-row`/`.panel-title`/
`.list` was trimmed to only its genuinely distinct rules (a 3-column icon grid `.menu-row` has no
equivalent in `.item-row`); two rules that exactly shadowed base `shared.css` rules with identical
values (`.menu-row .icon svg`, `.menu-row .chevron`) were deleted outright rather than tokenized,
since they did nothing the base rule or the `icon()` factory's own SVG attributes didn't already do.

## 4. Accessibility Improvements

- **Real ARIA semantics on every segmented toggle** (`role="radiogroup"`/`"radio"`,
  `aria-checked`) — none of the 4 hand-wired copies had any.
- **`menu.html` gained a toaster.** It previously had none at all, so a failed `boot()` (auth or
  company load) was completely silent to the user — now matches every other screen's error
  -reporting convention.
- **`items.html`'s four `.fg-title` section headings** (Basics/Tax/Pricing/Stock) had no CSS
  anywhere and rendered as unstyled body text — now styled with existing tokens only (no
  letter-spacing value invented, since none matches exactly — see §8).
- **A real error-handling bug fixed**: `items.html`'s delete-confirmation always reported "used in
  stock or invoices" regardless of the actual failure (a network error or an RLS denial was
  misreported as a referential-integrity conflict). Now distinguishes Postgres's real
  `23503` (foreign_key_violation) code from everything else, surfacing the true error message
  otherwise.
- **`index.html`'s `.btn-new` shadow now re-themes.** It previously baked the light-theme
  `--stamp` hex into a literal `rgba()`, so the shadow stayed the same green in dark mode. Fixed
  with `color-mix(in srgb, var(--color-primary) 25%, transparent)` — a computed value of an
  existing token, not a new one; verified via computed-style inspection to resolve to the exact
  original light-theme color.
- Every dialog on every migrated screen now has consistent Escape/backdrop-click/Cancel handling
  and autofocus — previously inconsistent (some dialogs focused their first field, most didn't;
  none had backdrop-click-to-close).

## 5. Architectural Exception (Disclosed, Approved Before Implementation)

**`index.html` does not call `initShell()`.** It is the pre-company-selection entry screen;
`initShell()`'s sale/items/purchases/suppliers/stock/mfg navigation destinations all assume an
active company, which does not exist yet on this screen. Forcing the standard shell would expose
navigation that is unsafe to use from here. This was raised and approved before implementation
(not decided unilaterally) — every *other* applicable improvement (dialogs, buttons, loading,
tokens, accessibility) was still applied to `index.html`.

**Recommendation for a future milestone** (not built here, per the approval's own instruction):
evaluate whether `initShell()` should support multiple shell *profiles* — an `entry` profile
(no nav, just theme toggle) alongside the current `workspace` profile — rather than assuming
every page wants the full shell. This would let `index.html` adopt the same factory pattern
instead of remaining a permanent exception.

## 6. Performance Improvements

- **No JavaScript duplication increase** — the opposite: `renderResults()`/`renderProducedResults()`
  collapsed from 4 near-identical implementations to 1 shared factory + 4 short callback
  configurations; the kind-toggle collapsed from 4 hand-wired copies to 1 factory call each.
- **`createDataTable`-style loading states** (skeleton placeholders) now cover every list/search
  load that lacked one: `index.html`'s company list, `items.html`/`suppliers.html`'s lists,
  `sale.html`/`purchase.html`'s party/supplier picker lists — closing the single largest gap
  13A's audit found (zero loading feedback anywhere), now on all eight screens.
- No new DOM complexity: every new factory emits the same element count and structure the
  hand-written markup it replaces did.

## 7. Regression Results

**Baseline (before any 13B change): 1,443/1,443**, confirmed identical to 13A's own closing
figure — verified first, before Phase 0 began.

**After every one of the two shared-module phases and all seven screen migrations, the full suite
was re-run and stayed green** — no screen was migrated without a passing regression run
immediately after it, per this milestone's own requirement. No single regression failure occurred
at any point in this milestone.

**Final: 1,473/1,473** (1,443 pre-existing + 30 new checks in the expanded
`js/ui/uiFoundation.test.html`, covering `createSegmentedToggle()`'s full ARIA/interaction surface,
`renderSearchResults()`'s empty/populated/create-new/escaping branches, `setButtonBusy()`'s new
`data-busy-label` behavior, and `renderPageHeader()`'s new `backTitle`/`extraChipsHtml` params).

**Verification method per screen** (matching 13A's documented approach, since this environment has
no reachable seeded Supabase session for authenticated E2E testing): `node --check` on every
extracted module script; dialog-tag-balance and brace-balance structural checks; and the
"successful redirect to `index.html` when unauthenticated" proof — since every one of the seven
screens' synchronous top-level code (including every new `createDialog()`/`renderPageHeader()`/
`createSegmentedToggle()` call) must execute without throwing before `boot()`'s `requireAuth()`
call can even run, a clean redirect is conclusive proof the synchronous migration code is
error-free. `index.html` itself (no redirect — it reveals a sign-in gate instead) was verified via
its gate's `hidden` class being removed, the equivalent proof for that screen's own auth flow.

**Not run**: full authenticated interactive click-through (opening each migrated dialog while
signed in, completing a sale/purchase/production run end-to-end). Same disclosed, environment
-level limitation as Milestones 13A and 8.5 — no business-logic file was touched in this milestone
(confirmed by `git diff --name-only` containing zero files under `js/items.js`, `js/sales.js`,
`js/purchases.js`, `js/manufacturing.js`, `js/suppliers.js`, `js/supabaseClient.js`, or
`js/services/**`), which bounds the risk this gap represents the same way it did previously.

## 8. Files Modified

**New (2):** `js/ui/segmentedToggle.js`, `js/ui/searchResults.js`.

**Modified (11):** `js/ui/button.js` (setButtonBusy `data-busy-label` support), `js/ui/layout.js`
(renderPageHeader `backTitle`/`extraChipsHtml`), `js/ui/quickAddItemDialog.js` (dialog + segmented
-toggle adoption, fixing all 3 of its page consumers at once), `js/ui/uiFoundation.test.html`
(+30 checks), and all seven business screens: `menu.html`, `items.html`, `suppliers.html`,
`index.html`, `manufacturing.html`, `sale.html`, `purchase.html`.

**Untouched (confirmed):** `stock.html` (13A's reference), every Core ERP/BI/Data
Exchange/Infrastructure file, `css/shared.css` (zero new CSS or tokens — every new factory emits
classes that already existed), the Design System document (no amendment needed this milestone).

Total: 13 files, 574 insertions(+), 399 deletions(-).

## 9. Remaining Technical Debt

- **The party-card picker-trigger factory gap** (noted in the 13A audit, `docs/design-system-preview.html:97`)
  remains unbuilt — not in 13A's or 13B's mandated scope, three real consumers
  (sale.html/purchase.html/manufacturing.html's own party/supplier/produced-item trigger cards)
  still hand-write the same shape.
- **`.loyalty`'s stray `#E7D9B5` hex** (`css/shared.css`) — open since Milestone 8.3, still needs a
  product decision, not resolved by this milestone.
- **The Design System §9-vs-§16 touch-target conflict** — still an open governance question.
- **`suppliers.html`'s untokenised `0.04em` letter-spacing`** — confirmed again this milestone; no
  exact Design System token matches it, so it remains a documented literal rather than an invented
  token or a silent snap to the nearest value.
- **`index.html`'s shell-profile question** (§5) — a real architectural question for a future
  milestone, deliberately not resolved here.
- **Authenticated E2E verification** was not possible in this environment (§7).

## 10. Final Validation Report

- ✅ No temporary debug statements, `console.log`, TODO/FIXME markers, or commented-out
  experimental code in any new or modified file (grep-verified across all 13 files).
- ✅ Every new shared module (`segmentedToggle.js`, `searchResults.js`) is documented with a
  header comment explaining its provenance and has real, non-test consumers (verified via
  cross-file grep, not just the unit suite).
- ✅ No duplicate utilities introduced — `segmentedToggle.js`/`searchResults.js` import nothing and
  duplicate no existing helper; `escapeHtml` is imported, not reimplemented, everywhere it's used.
- ✅ All 21 pre-existing suites plus the expanded UI Foundation suite pass: **1,473/1,473**.
- ✅ Every migrated dialog uses `createDialog()` exclusively — zero hand-written
  `showModal()`/`close()` pairs remain (repo-wide grep across all seven screens).
- ✅ Every new/extended shared component remains generic and backward compatible: `setButtonBusy()`
  falls back to whole-button text when no `data-busy-label` child exists (stock.html's existing
  13A consumer, unit-tested); `renderPageHeader()`'s new params default to falsy/empty (stock.html's
  existing 13A call site, unit-tested).
- ✅ No business logic, Business Intelligence, database schema, Event Bus, or API file appears in
  the diff (grep-verified).
- ✅ Full diff reviewed file-by-file; every change traces to a specific, named migration item — no
  accidental formatting-only or unrelated changes found.
- ✅ Working tree scope is exactly 13 files: 2 new shared modules, 4 other shared-module edits, 7
  business screens. Nothing outside that set was touched.

## 11. Recommendations for Milestone 13C

1. Build the party-card picker-trigger factory (§9) once a milestone actually needs to touch one
   of its three consumers, following the same "build for a real consumer" discipline 13A/13B held
   throughout.
2. Resolve the `.loyalty` stray-hex and DS §9-vs-§16 touch-target governance questions — both are
   now blocking nothing, but remain genuinely open.
3. Evaluate `initShell()` shell profiles (§5) so `index.html` can stop being a permanent exception.
4. Consider consolidating the 6 duplicate `fmt` currency formatters and 8 duplicate `$` DOM-query
   helpers across the business screens into a shared utility — flagged by the original 13A audit's
   own "cross-cutting items" list, still not picked up by either 13A or 13B.
5. No further Design System amendment is anticipated — 13B introduced zero new tokens or CSS.

**Per this milestone's own explicit instruction: STOP here.** No commit, merge, tag, or push
without explicit approval, and no work begins on 13C until it is separately authorized.
