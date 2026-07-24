# Milestone 8.5 — Design System Adoption in the Business Screens

**Status:** Complete. Scope: the six business screens deferred by 8.3 — `items.html`,
`suppliers.html`, `stock.html`, `sale.html`, `purchase.html`, `manufacturing.html`.
`index.html`/`menu.html` were out of this milestone's screen order (index has its own topbar,
menu is a minimal launcher — neither surfaced any of the duplication this milestone targets).

## Summary

This is an **adoption-only** milestone, not a construction milestone: every business screen was
audited against the shared component library (`js/ui/*` factories + `css/shared.css` role tokens)
completed in 8.3/8.4, and migrated wherever an **existing** shared solution matched exactly. No new
shared factory, component, pattern, layout, interaction, or token was introduced — where a
screen's duplication had no existing shared solution, it was documented and left untouched rather
than invented (see Gap report).

- **15 raw-palette-token → role-token swaps**, all exact-value (§20.4): `--madder`/`--muted-ink`/
  `--ink`/`--paper`/`--rule`/`--rule-strong` → their `--color-*` aliases. Same underlying hex in
  every case — byte-identical rendering, confirmed via computed-style equality against a
  pre-change baseline. Distribution: Items 3, Suppliers 7, Stock 1, Sale 3, Purchase 1,
  Manufacturing 0 (audited — this screen had no raw-token usage at all).
- **4 `createEmptyState()` adoptions**, replacing hand-rolled `.empty.hidden` markup that matched
  the factory's `{title, message}` shape exactly: Items' item-list empty state, Suppliers' empty
  state, and Stock's two (`#list-empty`, `#batch-empty`). Previously this factory was used only by
  `index.html`.
- **Manufacturing required zero code changes.** Its duplication (a `.kind-toggle`, two
  `renderResults()`-shaped functions, raw `.btn` markup, dialogs, `#cart-empty`/`.result-empty`)
  maps entirely onto gaps with no existing shared factory (see below) — there was nothing
  byte-identical to migrate it onto, so nothing was changed.

## Migrated per screen

| Screen | Role-token swaps | `createEmptyState` adoptions |
|---|---|---|
| `items.html` | 3 (delete-dialog heading/sub/name) | 1 |
| `suppliers.html` | 7 (sort-row, detail-section, detail-row) | 1 |
| `stock.html` | 1 (`.sheet .sub`) | 2 (`#list-empty`, `#batch-empty`) |
| `sale.html` | 3 (loyalty-earn preview, discount label, pay-modes empty line) | 0 |
| `purchase.html` | 1 (pay-modes empty line) | 0 |
| `manufacturing.html` | 0 | 0 |

## Deliberately left literal / left untouched (not invented)

- **`#history-empty` (stock.html)** — title-only, no `<p>` message; `createEmptyState()` has no
  such variant. Passing an empty message would render a spurious `<p></p>` (not byte-identical);
  adding a title-only variant would be extending the factory to solve a one-off. Left hand-written,
  documented inline.
- **`#cart-empty` / `.result-empty`** (sale/purchase/manufacturing) — a different markup shape
  from `createEmptyState` (no `<h3>`+`<p>`, different class, not initially `.hidden`). Not forced
  into the factory.
- **`#firm-select`/`#invoice-date`/`#bill-date`** topbar chip fields (sale/purchase) — pre-existing
  documented Form Framework exception (36px inline `.chip` pill, a fundamentally different shape
  from the field factories' block layout); reconfirmed, not changed.
- Every structural/spacing literal 8.3 already ruled on (42/44/60/120/260px clearances, sidebar
  chrome, negative margins) — untouched, out of this milestone's scope.

## Gap report (per DS §21 rule 5 — documented, not invented)

Four shared factories the 8.3 report deferred to 8.5 are still **not built** — each screen's
duplication onto them was confirmed real, but building them is construction, not adoption, and is
out of this milestone's scope:

1. **Generic button** — ~105 raw `<button class="btn ghost/primary/danger">` instances across all
   six screens. Highly regular; a `createButton()` factory would absorb most, especially
   `sheet-actions` Cancel/Save pairs.
2. **Dialog/sheet shell** — 18 `<dialog><form class="sheet">…<div class="sheet-actions">` blocks
   with copy-pasted `showModal()`/`.close()`/cancel wiring per dialog. **No backdrop-click-to-close
   exists anywhere** in the app.
3. **Item-search results row** — `renderResults()` is verbatim-triplicated in sale.html:452,
   purchase.html:462, manufacturing.html:347 (plus manufacturing's second, near-identical
   `renderProducedResults()`). Differences between the three are trivial (price field name, GST vs.
   batch-tracked meta line, which add-handler it calls).
4. **Segmented toggle** — `.kind-toggle` (Goods/Service), hand-wired identically 4× (items.html,
   plus inside `#dlg-quick-item` for sale/purchase/manufacturing).

Carried over from 8.3, still unresolved (not in this milestone's scope — lives in `css/shared.css`,
not a business screen):

5. **`.loyalty { border: 1px solid #E7D9B5; }`** (shared.css) — stray hex with no palette var or
   role token. Still flagging for a future amendment decision.

## Verification

Method: two static servers (`python -m http.server`) — one on the current working tree, one on a
`git archive HEAD` snapshot taken immediately before each screen's edit — with Playwright
(chromium, cached locally) navigating each screen at **360 / 768 / 1280px × light / dark**.
Supabase's `esm.sh` import was stubbed with a fake client whose `getSession()` never resolves (so
`requireAuth()` hangs harmlessly instead of redirecting away, without erroring), and Google Fonts
requests were aborted (unreachable offline) — both applied identically to old and new captures.
Each screen's edited elements were forced into a visible/comparable state via `page.evaluate()`
(opening the relevant dialog, un-hiding the empty state) and their computed styles /
`outerHTML` compared against the pre-change baseline; screenshots were pixel-diffed with Pillow.
One swap per screen (sale.html/purchase.html's `renderPaymentModes()` line) is only reachable after
`boot()`'s auth call resolves, which is unreachable offline — verified instead by injecting the
literal before/after markup string into a scratch element on the same live page, since CSS
variable resolution is cascade-wide on a given page/stylesheet, not element-specific.

| Check | Result |
|---|---|
| Computed-style / DOM equality vs. baseline, all edited elements, every screen | **Identical** in every capture |
| Cumulative regression (each screen re-verified after every later screen's changes) | **No regressions** — Items↔Suppliers↔Stock↔Sale↔Purchase all confirmed unchanged at each step |
| Console errors (`console`/`pageerror`, all 6 screens × 3 widths × 2 themes, final pass) | **0** across 36 captures |
| Form Framework unit tests (`forms.test.html`), re-run after every commit | **80/80 passed**, unchanged throughout |
| Pixel diff, all screens/combos | Effectively **byte-identical** — the handful of 1–24px diffs that appeared were proven (via same-code, same-server, run-twice comparisons) to be non-deterministic sub-pixel rendering jitter in an unrelated screen region, not a regression |

Full authenticated CRUD workflow exercises (add/edit/delete item, complete a sale, etc. against
real seeded data) were not run — this environment has no reachable Supabase project. This is an
acceptable limitation given the change shape: no business-logic file (`js/items.js`, `js/sales.js`,
`js/purchases.js`, `js/manufacturing.js`, `js/suppliers.js`, `js/supabaseClient.js`) was touched in
any commit this milestone — every edit was a markup/token substitution proven byte-identical.

## Regression summary

**None.** Zero visual, functional, or console regressions detected across all six screens,
verified cumulatively at every step. No product, UX, Design System, workflow, business-logic, or
navigation change. The four documented gaps (button, dialog shell, search-results row, segmented
toggle) remain unbuilt — a future milestone can pick them up as an explicit construction/amendment
decision, not bundled into an adoption pass.
