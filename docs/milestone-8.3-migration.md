# Milestone 8.3 — Design System Adoption in the Shared UI Layer

**Status:** Complete. Scope: `css/shared.css` (component rules) + `js/ui/*.js` shared factories.
Business screens (`index.html`, `menu.html`, `sale.html`, `purchase.html`,
`manufacturing.html`, `stock.html`, `items.html`, `suppliers.html`) are explicitly out of scope —
deferred to 8.5 ("migrate business screens onto the already-completed shared component library").

## Summary

Every hardcoded value in the shared UI layer that has an exact-match token from the Milestone 8.2
Design System now consumes that token. No new tokens, component categories, or variants were
introduced. No product/UX/workflow/business-logic/navigation change. Behaviour is byte-for-byte
identical — verified by pixel-diffing rendered output before and after migration (see
Verification).

- **664 token references**, spanning **89 distinct tokens**, now used in `css/shared.css`'s
  component rules (previously 0 — the tokens existed only in the additive `:root` block from 8.2
  with no consumers).
- **2 shared JS factories** (`js/ui/batchRow.js`, `js/ui/partyRow.js`) had inline `style=` attributes
  with hardcoded `font-weight`/`color`/`font-size` values; both now reference the same tokens.
- All other `js/ui/*` and `js/ui/forms/*` files were already token-clean (no raw styling — they
  emit class names and delegate to `icon()`).

## Migrated components

Every component category in `css/shared.css` below the `:root` token block: base reset/typography,
inputs, buttons (`.btn`/`.btn-open`/`.btn-mini`), icon buttons, cards, badges, kebab/dropdown menu,
empty state, dialogs (`dialog`/`.sheet`/`.form-grid`), Form Framework field chrome
(`.field`/`.field-label`/`.field-help`/`.field-error`/`.quick-pick-chips`), toasts, the cart-shell
pattern (search results, cart header/list/line, line-controls, batch-fields), chips/pills
(`.chip`/`.pay-pill`/`.filter-pill`/`.batch-tag`/`.ledger-type`), party/picker rows, panels, totals,
save-bar/mini-totals, the desktop sidebar (structural values only — see below), and the stock-app
list/drill/ledger views. Plus `batchRow.js` and `partyRow.js`'s inline row-label styling.

Every swap is **exact-value** (e.g. `padding:16px` → `var(--space-16)`,
`z-index:60` → `var(--z-sidebar)`, `border-radius:999px` → `var(--r-pill)`) per §20 of the Design
System.

### Semantic-role resolutions (§6-guided, not new decisions)
- `var(--stamp)` → `--color-primary` everywhere except `.badge-success` and `.ledger-qty.in`, which
  use `--color-success` (the doc's own named success-semantic exception; same underlying value).
- `var(--paper)` → `--color-surface` for component surfaces; `--color-bg` only for `body`'s own
  background.
- `var(--gold)` → `--color-warning` (caution/low-stock) vs. `--color-info` (`.badge-info`,
  `.chip.firm .dot`).

## Deliberately left literal (per 8.2 §4/§7 — unchanged from the audit)

- Structural offsets: `42px`/`44px` (search-icon clearance), `60px` (mobile save-bar/bottom-nav
  clearance), `120px`/`260px` (fixed-bar clearance).
- The always-dark **sidebar chrome** hex (`#14161A`, `#C9C7BE`, `#fff`, `rgba(255,255,255,.06)`) —
  documented intentional exception; the sidebar doesn't re-theme. Only the sidebar's *structural*
  values (width, z-index, spacing, type, and the semantic `.sidebar-item.active` accent) were
  tokenized.
- `border-radius: 50%` (`.chip .dot`, a true circle) and its `6px` size (element sizing, not a
  spacing/control-height consumer).
- `.menu { top: 44px }` / `body.stock-app .menu { top: 40px }` — coincidentally equal to control
  tokens but express "distance below the kebab button," not a control height; left literal per the
  audit's own judgment-call note.
- Negative margins (`-4px`) — no token exists for negative spacing; not invented.
- The `dialog::backdrop` rgba and `.loyalty` border hex (see Gap Report).

## Gap report (per §21 rule 5 — documented, not invented)

1. **`.loyalty { border: 1px solid #E7D9B5; }`** — a stray hex with no palette var or role token.
   Left untouched; flagging for a future amendment decision (add a token, or fold onto an existing
   `--color-*-soft` border if one is judged an acceptable visual match — not decided here).
2. **No shared factories yet for:** a generic button, a dialog/sheet shell, a segmented toggle, or
   an item-search result row. These were identified by the 8.3 scoping exploration as patterns
   several business screens will need when 8.5 converges them onto shared implementations. Not
   built in 8.3 (out of scope — shared layer only); listed here so 8.5 planning has them.
3. No value was found in `css/shared.css` that lacked an exact 8.2 token — the 8.2 audit was
   exhaustive; nothing was snapped to a "nearest" token.

## Verification

Method: static server (`python -m http.server`), Playwright (`chromium`, cached locally) driving
the two unauthenticated shared-component fixtures — `docs/design-system-preview.html` (every
shared factory, real code) and `js/ui/forms/forms.test.html` (Form Framework unit tests) — at
**360 / 768 / 1280px × light / dark** (12 captures), pixel-diffed with Pillow against a baseline
captured from the committed pre-migration state.

| Check | Result |
|---|---|
| Pixel diff, 12 captures (2 fixtures × 3 widths × 2 themes) | **0 differences** — byte-identical |
| Form Framework unit tests (`forms.test.html`) | **80/80 passed**, unchanged |
| Console errors (both fixtures, Playwright `console`/`pageerror` listeners) | **0** |
| CSS structural integrity (`{`/`}` balance) | 302/302 balanced |

## Regression summary

**None.** Zero visual, functional, or console regressions detected. No product, UX, Design System,
workflow, business-logic, or navigation change. Business screens are untouched — their convergence
onto this now-token-complete shared layer is Milestone 8.5's scope.
