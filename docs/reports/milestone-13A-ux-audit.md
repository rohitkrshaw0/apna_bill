# Milestone 13A — UX Audit, Component Inventory & Design System Compliance

**Status:** Complete. This document is Deliverables 1–3 of Milestone 13A: a read-only inventory
of the ApnaBill frontend as it exists today. **It fixes nothing.** Every finding is recorded with
a `file:line` citation so a later milestone can act on it without re-deriving the evidence.

**Method:** all 8 business screens, all 38 files under `js/ui/**`, `css/shared.css` (739 lines),
and `docs/design-system-preview.html` were read in full. Counts were verified by grep, not
estimated.

**Scope boundary:** this audit covers the *presentation* layer only. The Core ERP, Business
Intelligence, Data Exchange, and Infrastructure platforms are frozen and were not inspected for
change — only to confirm 13A does not touch them.

---

## Part 1 — UX Audit

### 1.1 Screen-by-screen map

| Screen | Lines | Page `<style>` rules | `<dialog>` | Raw `.btn` | `showModal()` / `close()` | `createEmptyState` | `createDataTable` | `initShell` |
|---|---|---|---|---|---|---|---|---|
| `index.html` | 367 | 10 | 3 | 7 | 3 / 6 | 1 | no | **no** |
| `menu.html` | 106 | 12 | 0 | 0 | 0 / 0 | 0 | no | yes |
| `sale.html` | 713 | **0** | 4 | 9 | 3 / 7 | 0 | no | yes |
| `purchase.html` | 727 | **0** | 4 | 10 | 6 / 9 | 0 | no | yes |
| `manufacturing.html` | 550 | 10 | 2 | 4 | 1 / 1 | 0 | no | yes |
| `stock.html` | 412 | 2 | 2 | 3 | 2 / 3 | 2 (+1 hand-written) | yes | yes |
| `items.html` | 390 | 1 | 2 | 4 | 2 / 5 | 1 | yes | yes |
| `suppliers.html` | 348 | 10 | 2 | 5 | 2 / 5 | 1 | yes | yes |

**Totals: 19 dialogs, 42 raw `.btn` instances, 19 `showModal()` against 36 `close()` call sites,
25 inline `style=""` attributes, 0 `<table>` elements, 0 loading indicators, 0 `alert()`/`confirm()`.**

### 1.2 Duplicated components

**Four functions triplicated verbatim across the three transaction screens.** Differences between
copies are trivial (a price field name, a noun, one dropped call):

| Function | `sale.html` | `purchase.html` | `manufacturing.html` |
|---|---|---|---|
| `renderResults()` | 454–480 | 464–490 | 349–374 (+ `renderProducedResults()` 310–335) |
| `renderFirmChip()` | 345–374 | 334–361 | 281–307 |
| `chooseBatch()` / `chooseBatchTemplate()` | 518–539 | 530–551 | 418–439 |
| `renderCart()` | 540–560 | 552–582 | 440–468 |
| `renderPaymentModes()` | 563–580 | 585–605 | — |
| `recompute()` | 588–652 | 608–663 | 471–490 |
| `save*()` | 655–707 | 666–721 | 493–544 |

`renderFirmChip` is the most literal case: `sale.html:346-373` and `purchase.html:335-360` are
identical apart from comments; `manufacturing.html:301-306` differs only by dropping a trailing
`recompute()` call.

**Cross-cutting boilerplate duplicated on all 8 screens:**

- `const $ = (s) => document.querySelector(s)` — 8 copies (`index:152`, `sale:264`,
  `purchase:233`, `manufacturing:174`, `stock:122`, `items:133`, `suppliers:139`, `menu:81`).
- An identical single-line currency `fmt` — **6 copies** (`sale:265`, `purchase:234`,
  `manufacturing:175`, `stock:124`, `items:135`, `suppliers:141`).
- The boot error handler `boot().catch(err => { console.error(err); toast('Startup error: ' + …) })`
  — **7 identical copies**; `menu.html:102` has a degenerate variant with no toast at all.
- The disable-and-relabel save pattern — **7 hand-rolled copies** (§1.7).
- `index.html:194-197` defines its **own local `escape()`** rather than importing
  `js/ui/escape.js`; the other 7 screens all import it.
- The zero-lines reset array is duplicated verbatim at `sale.html:590` and `purchase.html:610`.

**Classes referenced in markup with zero CSS anywhere in the repo** (verified repo-wide):
`.btn-add` (`items:38`, `suppliers:47`), `.loadmore`/`.btn-more` (`items:51,52`,
`suppliers:68,69`), `.field-group` (`items:63,77,82,87`), `.price-col` (`items:264`), and
`.fg-title` (`items:64,78,83,88`) — the last is styled *only* inside `.detail-section` by
`suppliers.html:21`, so **items.html's four section headings render as unstyled body text**.

### 1.3 Layout & spacing inconsistencies

- **`index.html` is the structural outlier.** It is the only screen that never calls
  `initShell()` (its imports at `139-150` omit `layout.js`), so it has no sidebar and no bottom
  nav. Its topbar uses an inline-styled `<div style="display:flex;gap:8px…">` (`:44`) instead of
  `.topbar-right`, which means `ensureShellChrome()`'s theme-toggle auto-creation
  (`layout.js:77-86`) could never fire there even if `initShell` were called.
- **Three different magic offsets for the same search-icon clearance:** `40px`
  (`index.html:14`), `42px` (`shared.css:617`), `44px` (`shared.css:624`).
- **`menu.html:16`** overrides `body.stock-app .wrap` and restates its first two values as
  literals purely to change the third.
- **The bottom-nav height `60px` is a magic number in three places** (`menu.html:17`,
  `shared.css:561`, `shared.css:574`). A `--nav-sidebar-width` token exists (`shared.css:127`)
  but there is no bottom-nav-height counterpart.
- **`manufacturing.html:20`** (`.sheet .form-grid { margin-top: 0 }`) exists solely to undo its
  own un-scoped override on the line above — a specificity band-aid.
- **`manufacturing.html:77`** sets `style="margin-top:0"` to fight its own page-local
  `.search-wrap { margin-top:12px }` at `:18`, in the same file.
- `manufacturing.html` is the only `cart-app`-style screen with **no `<div class="app">` wrapper**
  (sale `:15`, purchase `:15` both have one) and it uses `<div class="wrap">` where every other
  screen uses `<main>`.
- **`stock.html` has two `<main>` elements** (`:34`, `:51`), the second hidden by a CSS class
  rather than the `hidden` attribute. The HTML spec permits multiple `<main>` only when the
  extras carry the `hidden` *attribute*, so this is technically invalid.

### 1.4 Typography inconsistencies

`menu.html` re-implements `.item-row` (`shared.css:698`) almost line for line as `.menu-row`,
with every size written as a literal that has an exact token: `15px` = `--text-15`, `12.5px` =
`--text-12-5`, `13px` = `--text-13`, `36px` = `--control-36`. `menu.html:27` (`.menu-row .chevron`)
is a **byte-identical duplicate** of `shared.css:705`.

`suppliers.html:21` uses `letter-spacing: 0.04em`, which has **no matching token** — the nearest
is `--tracking-label` at `0.06em`. Recorded, not resolved.

`.sheet .sub` exists in **three copies with three different `margin-top` values**: `shared.css:361`
(none), `shared.css:632` (`-4px`, cart pages), `stock.html:18` (`-6px`).

### 1.5 Button inconsistencies

42 raw `.btn` instances, in recurring shapes that no factory produces:

- **ghost "Cancel" + primary "Save" pair — 10 occurrences** (`index:84-85`, `index:96-97`,
  `sale:144-145`, `sale:187-188`, `purchase:134-135`, `purchase:178-179`,
  `manufacturing:146-147`, `stock:83-84`, `items:93-94`, `suppliers:113-114`).
- ghost + **danger** confirm pair — 2 (`index:109-110`, `items:108-109`).
- two-ghost "Skip / Cancel" in batch pickers — 3 (`sale:157-158`, `purchase:148-149`,
  `manufacturing:116-117`).
- `purchase.html:121` mixes an **`<a class="btn ghost">`** into a `.sheet-actions` row otherwise
  made of `<button>`s.

Beyond `.btn`, there are 8 further hand-rolled button variants: `.btn-new`, `.btn-add`,
`.btn-more`, `.btn-mini`, `.kind-btn`, `.btn-gen`, `.filter-pill`, `.pay-pill`, `.save-btn`,
`.back-btn`, `.icon-btn`, `.result-add-new`.

`index.html:21-27`'s `.btn-new` duplicates `.btn-open` (`shared.css:283`) and `.save-btn`
(`shared.css:562`), and its `:active` rule at `:27` is byte-identical to `shared.css:564`. Its
`box-shadow: 0 4px 14px rgba(42,95,79,0.25)` bakes the **light-theme** `--stamp` hex into an RGBA
literal, so **it does not re-theme** — in dark mode `--stamp` becomes `#3FA07F` while this shadow
stays `#2A5F4F` green.

### 1.6 Card, form, table & dialog inconsistencies

**Cards.** `menu.html:21` re-implements `.item-row`; `index.html:30` (`.gate .card2`)
re-implements the `dialog` surface (`shared.css:353-357`); `index.html:32` (`.gate p`) is an exact
duplicate of `.sub` (`shared.css:251`) written as a bare descendant selector.

**Tables.** There is **no `<table>` element anywhere in the repo.** All tabular data is CSS grid,
in **8 distinct pseudo-table idioms**, of which only one (`.item-row`) goes through
`js/ui/dataTable.js`:

| Idiom | Used by | Via `dataTable.js`? |
|---|---|---|
| `.item-row` | items, stock, suppliers | **yes** |
| `.cart-list`/`.cart-line` | sale, purchase, manufacturing | no — 3 copy-pasted `renderCart()` |
| `.stock-batch-row` | stock | no — 2 hand-built `innerHTML` templates, 90% identical |
| `.ledger-row` | stock | no — hand-built `innerHTML` |
| `.detail-row` | suppliers | no — 7 static hand-written rows |
| `.results`/`.result-row` | sale, purchase, manufacturing | no — 4 copy-pasted `renderResults()` |
| `.picker-list .row` | sale, purchase, manufacturing | own factories (`partyRow`, `batchRow`) |
| `.list` + `.card` | index | no — re-implements `createDataTable`'s body inline |

**Dialogs.** 19 `<dialog>` elements, all hand-wired. **No page anywhere registers a
`close` or `cancel` event listener** (verified: 0 occurrences repo-wide) — every dialog is closed
imperatively, which is the root cause of the defect in §1.9. `purchase.html` is the worst case: 6
`showModal()` against 9 `close()`, with picker↔form dialogs handing off to each other manually in
4 separate places (`:380-384`, `:398-401`). `items.html:294,298` closes the same dialog in two
branches of one `try/catch`.

Dialog width caps are inconsistent: `--dialog-max-w` is 560px, `body.cart-app` uses
`--dialog-max-w-compact` 520px, `stock.html:17` hardcodes `520px` (the same value as the token it
doesn't use), and `items.html:17` hardcodes **640px**, which matches no token at all.

**Forms.** Inline field-level validation exists on **exactly 2 of 8 screens and for exactly 1
rule** — `items.html` (`:143`, `:223`, `:312`, `:364`) and `suppliers.html` (`:150`, `:203`,
`:293`, `:325`), both only for "name is required". Every other field on every other screen has no
inline validation. `index.html:133` uses a hand-written form-level error slot (`#gate-err`)
deliberately outside the Form Framework.

### 1.7 Loading state inconsistencies — the largest single gap

**There is no loading state anywhere in the repository.** Grep across all 8 screens and
`css/shared.css` for `loading`, `spinner`, `skeleton`, `shimmer`, `aria-busy`, `<progress>`
returns **zero matches**. (The only `progress*` hits are `progressTracker` in
`js/services/dataExchange/**`, a backend job-progress model with no UI.)

What exists instead:

1. **Disable-and-relabel on submit, hand-copied 7×** — `index:285-288`/`307-308` ("Creating…"),
   `sale:656-661`/`704-705`, `purchase:667-672`/`718-719`, `manufacturing:494-499`/`541-542`,
   `items:343-345`/`383`, `suppliers:314-316`/`341`, and `stock:359-360`/`375` — which **disables
   the button but never changes its label**, the one inconsistent copy.
2. **Nothing at all on initial page load.** Every screen hardcodes a literal `—` placeholder and
   swaps it after `await` (`sale:22`, `purchase:22`, `manufacturing:35`, `stock:27`, `items:26`,
   `suppliers:35`, `menu:37`, `index:42`). Lists render into void: `createEmptyState` emits
   `class="empty hidden"`, so during load there is neither content nor empty state.
3. **`stock.html:380-388` calls `showModal()` at `:384` *before* awaiting the ledger fetch**, and
   explicitly hides `#history-empty` at `:383` — the user sees a blank sheet for the duration of
   the request.
4. **The inverse problem elsewhere:** `items.html:314-337`, `suppliers.html:269-286` and
   `:295-308` all `await` *before* opening — the user taps a row and **nothing visibly happens**
   until the round-trip completes.
5. **Search** (`sale:311-318`, `purchase:304-311`, `manufacturing:247-254`, `:265-272`) has no
   in-flight state; stale results stay on screen. There is no request sequencing either, so a
   slow earlier response can overwrite a faster later one.
6. **"Load more"** (`items:207`, `suppliers:201`) has no pending state and no disable, so a
   double-click issues a duplicate page fetch.

### 1.8 Empty & error state inconsistencies

**Empty states: 9 hand-written vs 5 factory-built.** `createEmptyState()` is used on only 3 of 8
screens. All six `.result-empty` blocks across sale/purchase/manufacturing are byte-identical
modulo one noun, and each is paired with a copy-pasted `.result-add-new` quick-add button.

`stock.html:97`'s `#history-empty` carries an in-code admission that the factory has no title-only
variant — the gap documented at `docs/milestone-8.5-migration.md:44-47`.

`createEmptyState` interpolates `title` and `message` **raw, without `escapeHtml`**, unlike
`partyRow.js`, `batchRow.js`, and every form field factory. `createBadge` (`badge.js:1`) has the
same issue.

**Error states.** No `alert()` and no `confirm()` anywhere — confirmation uses dedicated dialogs,
which is correct. Everything else is `toast(msg, 'warn')` + `console.error`. Problems:

- **`menu.html` has no toaster and no `#toasts` container at all.** Its only error path is
  `console.error` at `:102` — a failed auth or company load is **completely silent** to the user.
- **Load failures are indistinguishable from empty results.** Default toast lifetime is 3200ms
  (`toast.js:4`); after it vanishes, a failed list load (`items:251-253`, `suppliers:221-223`,
  `stock:210`) leaves the screen showing "No items yet".
- **`items.html:297-300` swallows the error entirely** — `catch (err)` never reads `err` and
  always reports *"it's used in stock or invoices"*, so a network failure or RLS denial is
  misreported as a referential-integrity conflict.
- Two catch blocks log nothing (`sale:402`, `purchase:409`).
- Duplicate-key (23505) handling is copy-pasted three times with the same string
  (`items:378-380`, `purchase:713-715`, `quickAddItemDialog.js:112-114`).
- At least **8 distinct error-copy prefix conventions** are in use ("Could not load stock: ",
  "Save failed: ", "Failed: ", "Could not save: ", …).

### 1.9 A real defect found during the audit

**`chooseBatch()` hangs forever when dismissed with Escape.**

The function returns a Promise resolved only by the `#batch-skip` / `#batch-close` click handlers
registered with `{ once: true }` (`sale.html:534-535`). Pressing **Esc** closes the native
`<dialog>` without firing either handler, so the promise **never settles** and the `await` in
`addItemToCart` (`sale.html:490`) hangs permanently.

It compounds: the un-fired `{once:true}` listeners stay attached, so the next `chooseBatch()` call
adds a *second* pair, and one subsequent click then resolves both the stale and the current
promise. Triplicated at **`sale.html:518-539`, `purchase.html:530-551`,
`manufacturing.html:418-439`**.

This is infrastructure-level, not business logic: it is a dialog *lifecycle* fault, caused by the
repo-wide absence of `close`/`cancel` event handling noted in §1.6.

### 1.10 Navigation inconsistencies

`initShell()` fills containers but the `<header class="topbar">` shell itself is **hand-written on
all 8 pages**, in three shapes:

- **Shape A** (`stock:23-31`, `items:22-30`, `suppliers:31-39`, `menu:33-41`) — 9 lines,
  identical but for the crumb string. No `title` on the back button.
- **Shape B** (`sale:15-42`, `purchase:15-39`) — adds `title="Back to companies"` plus firm and
  date chips. Both date inputs carry a **4-declaration inline style** duplicating
  `shared.css:433`, which already implements the identical reset for the sibling `<select>`.
- **Shape C** (`manufacturing:30-45`) — Shape B without the date chip.

Shape A's four screens write `.brand` on one line; sale/purchase/manufacturing write it across
four. `index.html` matches none of the three.

### 1.11 Mobile inconsistencies

Breakpoints in `css/shared.css` are 480px, 420px, 899px, 900px — a coherent set. No horizontal
overflow was found at any audited width. The real mobile gaps are behavioural, not layout:

- **No skeleton or progress feedback on a slow mobile connection** (§1.7) — the most
  mobile-relevant gap in this audit, since a counter operator on 3G sees blank regions.
- Touch targets below the DS §16 44px minimum are catalogued in §3.6.
- `manufacturing.html` lacks the sticky save/cost anchor its siblings have — already recorded as
  CL-9 in `docs/milestone-8.1-ux-architecture.md:683`, and out of 13A scope.

---

## Part 2 — Component Inventory

Every reusable component that already exists. **13A must not duplicate anything in this list.**

### 2.1 `js/ui/*.js`

| File:line | Export | Signature | Produces |
|---|---|---|---|
| `badge.js:1` | `createBadge` | `(text, variant='neutral')` → string | `span.badge.badge-{variant}` |
| `barcode.js:1` | `generateBarcodeCode` | `()` → string | 12-digit code |
| `batchRow.js:5` | `createBatchRow` | `({label, subtitleHtml, stockText, onClick})` | `button.batch-row` |
| `card.js:7` | `createListCard` | `({name, current, metaHtml, openLabel, onOpen, kebabActions})` | `div.card` + `.btn-open` + kebab |
| `dataTable.js:10` | `createListRow` | `({primaryText, badgesHtml, meta, values, trailing, onClick})` | `div.item-row` |
| `dataTable.js:53` | `createDataTable` | `({listSelector, emptySelector, renderRow})` → `{setRows}` | — |
| `debounce.js:1` | `debounce` | `(fn, ms=250)` | — |
| `emptyState.js:1` | `createEmptyState` | `({id, title, message})` → string | `div.empty.hidden` |
| `escape.js:1` | `escapeHtml` | `(s)` → string | — |
| `icons.js:21` | `icon` | `(name, {size=18, className, strokeWidth=2})` → string | `<svg>` |
| `kebabMenu.js:4` | `initKebabAutoClose` | `()` | document click listener |
| `kebabMenu.js:11` | `createKebabMenu` | `(actions)` | `button.kebab` + `div.menu` |
| `layout.js:101` | `initShell` | `({current, backHref, only, bottomNavActive, …Selector})` | sidebar, bottom-nav, chips, theme toggle |
| `partyRow.js:12` | `createPartyRow` | `({name, phone, gstin, balanceHtml, balanceOwes, onClick, onEdit})` | `button.row` |
| `quickAddItemDialog.js:27` | `initQuickAddItemDialog` | `({createItem, toast, onCreated})` → `{open}` | fields into `#dlg-quick-item` |
| `searchInput.js:3` | `createSearchInput` | `({id, placeholder})` → string | `div.search-wrap` + `input.search` |
| `theme.js:6` | `currentEffectiveTheme` | `()` | — |
| `theme.js:16` | `initThemeToggle` | `(selector='#theme-toggle')` | sun/moon icons |
| `toast.js:2` | `createToaster` | `(containerId='toasts')` → `toast(msg, type='ok', ms=3200)` | `div.toast[role=alert]` |

### 2.2 `js/ui/forms/` — the Form Framework

**Core:** `renderField` (`core/renderField.js:28`), `renderFieldsInto`
(`core/renderFieldsInto.js:22`), `renderFieldWrapper`, `renderFieldLabel`, `renderFieldError`,
`setFieldError`/`clearFieldError` (`core/fieldError.js:31,37`), `buildControlAttrs`, `idSelector`,
`validateField`/`watchFieldValidation` (`core/fieldValidation.js:44,61`).

**Fields** (all return `{html, mount(root)}`): `textField`, `numberField`, `currencyField`,
`selectField`, `textareaField`, `checkboxField`, `quickPickNumberField`, `gstRateField`.

**Components:** `lineItemRow` (`components/lineItemRow.js:39`).
**Validators:** `required`, `percentage`, `currency`.

`forms/index.js` is the only sanctioned import path (`docs/FormFramework.md:28-31`).

### 2.3 Reuse opportunities and confirmed gaps

**Under-used existing components** — reuse before building anything:

- `js/ui/card.js` and `js/ui/searchInput.js` are consumed by **`index.html` only** — the two
  least-shared modules in a "shared" folder.
- `js/ui/dataTable.js` reaches 3 of 8 screens; `js/ui/emptyState.js` 4 of 8.
- `.sr-only` (`shared.css:230`) is **defined but has zero callers.** The one place needing the
  technique, `.back-btn-label` (`shared.css:443`), re-declares the same four properties inline.

**Confirmed missing (the 8.5 gap report re-verified against current code — all still absent):**

1. **Generic button factory** — `createButton` does not exist. 42 raw `.btn` instances.
2. **Dialog / sheet shell factory** — 19 hand-wired dialogs; no shared `showModal`/`close`/Esc
   wiring; no backdrop-click-to-close anywhere. **This absence is the direct cause of §1.9.**
3. **Segmented toggle** — `.kind-toggle` hand-written 4× (`items:65`, `sale:174`, `purchase:165`,
   `manufacturing:133`). Confirmed by the in-code note at `quickAddItemDialog.js:7`.
4. **Search-results row** — `renderResults()` triplicated (+1 near-copy).
5. **Party-card picker trigger** — a fifth gap, undocumented until now, stated at
   `docs/design-system-preview.html:97`.
6. **Any loading/skeleton/placeholder component** — §1.7.
7. **A page-header / four-band layout factory** — required by
   `docs/milestone-8.1-ux-architecture.md` §8 and §13 ("the four-band screen skeleton as a
   reusable layout, so Home/Customers/histories are composed, not hand-built") and still unbuilt.

---

## Part 3 — Design System Compliance Audit

Validated against `docs/milestone-8.2-design-system.md`. **Violations are recorded, not fixed**,
except where 13A's approved scope covers them (§3.4, §3.5).

### 3.1 Token adoption

`css/shared.css` is token-complete below `:root` — the 8.3 migration holds. Violations live
almost entirely in the **page-local `<style>` blocks** the 8.3/8.5 milestones placed out of scope:

- `index.html:12-35` and `menu.html:12-29` use the **legacy alias tokens** (`--paper`, `--rule`,
  `--stamp`, `--ink`, `--muted-ink`) rather than the `--color-*` role tokens DS §20.4 requires.
- `manufacturing.html:12-26` writes `12px`/`16px`/`20px`/`300px` as literals where
  `--space-12`/`--space-16`/`--gutter` exist.
- `suppliers.html:17-26` correctly uses `--color-*` roles but writes every size as a literal.

### 3.2 Remaining hardcoded values in `css/shared.css`

Five hex literals exist below the token block. Four are the **sanctioned always-dark sidebar
chrome** (`:661`, `:665`, `:669`, `:672`) plus the `dialog::backdrop` rgba (`:358`).

The fifth is a genuine violation: **`css/shared.css:553` — `.loyalty { border: 1px solid #E7D9B5 }`**,
a stray hex with no palette var or role token. First flagged at
`docs/milestone-8.3-migration.md:65`, re-flagged unchanged at `docs/milestone-8.5-migration.md:79-80`,
**still unresolved**. It is outside 13A's approved amendment scope and is deliberately left
untouched here; it needs its own product decision.

### 3.3 Dark mode

Compliant. Two blocks (`:167-186` `prefers-color-scheme`, `:187-204` `data-theme`) supply dark
values for 15 base tokens; all `--color-*` roles re-theme automatically because they are `var()`
aliases. One violation outside the stylesheet: `index.html:26`'s baked-in RGBA shadow (§1.5).

### 3.4 Focus states — **non-compliant, WCAG 2.4.7 failure**

DS §17 requires "visible `--focus-ring` on every control"; DS §18 repeats it. **Only two focus
rules exist in the entire stylesheet:**

- `shared.css:220` — `input:focus` (plain `:focus`, inputs only)
- `shared.css:482` — `.result-row:focus-visible`, and only as a hover-parity background

There is **no focus indicator at all** on `button`, `.btn`, `.icon-btn`, `.kebab`, `.chip`,
`.pay-pill`, `.filter-pill`, `.sidebar-item`, `.bn-item`, `.save-btn`, `.menu button`,
`.picker-list .row`, `.kind-btn`, or `.back-btn` — and `shared.css:215` sets `button { border: 0 }`
with no outline restoration. **Within 13A's approved compliance scope; fixed in this milestone.**

### 3.5 Motion — **non-compliant**

DS §18 requires wrapping the §15 transitions in `@media (prefers-reduced-motion: reduce)`. **No
such block exists anywhere in the repo.** The transitions needing the guard are `shared.css:562`
(`.save-btn` transform + background) and `:564` (`:active` `scale(0.98)`). **Within 13A's approved
compliance scope; fixed in this milestone.**

### 3.6 Touch targets — **an internal Design System conflict, not resolved here**

DS §16 requires ≥ `--control-44` for any tap. DS §9 states all buttons need only ≥ `--control-34`.
**These two rules contradict each other**, and 14 interactive rules currently sit below 44px:

`--control-30`: `.quick-pick-chips button` (`:401`). `--control-34`: `.filter-pill` (`:681`),
`.btn-mini` (`:712`). `--control-36`: `.chip.chip-btn` (`:428`), `.back-btn` (`:434`),
`.result-add` (`:486`), `body.stock-app .kebab` (`:618`). `--control-40`: `.icon-btn` (`:261`),
`.kebab` (`:328`), `.btn-open` (`:283`), `.pay-pill` (`:539`), `.loyalty-redeem input` (`:557`).
Padding-only, ~24px effective: `.picker-list .row-edit` (`:587`), `.line-remove` (`:510`).

Per the standing rule that this audit does not silently resolve conflicts in a governing
document, **this is escalated as an open product decision**, not corrected. It is the single
largest remaining accessibility question in the design system.

### 3.7 Accessibility audit of the shared layer

**Present:** `aria-label` on the kebab trigger (`kebabMenu.js:14`) and theme toggle
(`layout.js:83-84`); `role=button` + `tabindex=0` + Enter/Space on clickable rows
(`dataTable.js:40-46`) and the edit affordance (`partyRow.js:22,32-35`); `role="alert"` per toast
(`toast.js:12`); implicit label association for all 8 field types via the `<label>` wrapper
(`fieldWrapper.js:43`); native `required`/`disabled`/`readonly` (`buildControlAttrs.js:18-24`);
focus-on-invalid (`fieldValidation.js:50`); autofocus on quick-add (`quickAddItemDialog.js:74`);
the sr-only back-label technique (`shared.css:443`).

**Missing:**

1. **No `aria-describedby`** linking `.field-error`/`.field-help` to their control — named as
   future work at `buildControlAttrs.js:5`. Errors are visible but **programmatically invisible**.
2. **`aria-invalid` is never set** — `setFieldError` (`fieldError.js:31-34`) only writes text.
3. **The error slot is not a live region**, so errors surfaced after render are silent.
4. **The kebab menu is not an ARIA menu**: no `aria-expanded`, `aria-haspopup`, `role=menu`/
   `menuitem`, no Escape-to-close, no focus restore — and it **nests `<button>` inside `<button>`**
   (`kebabMenu.js:12` and `:18`), which is invalid HTML that browsers reparent unpredictably.
   `dataTable.js:35-39` and `partyRow.js:27-30` both explicitly avoid this nesting, making this
   file the outlier.
5. **The toast container is not a live region** — no `aria-live`, `role=status`, or `aria-atomic`
   on `#toasts`, so every toast is announced assertively, including routine successes.
6. **`icon()` emits no `aria-hidden="true"`** (`icons.js:25`), exposing every decorative icon.
7. **`createSearchInput` has no accessible name** (`searchInput.js:7`) — placeholder only.
8. **Nav landmarks are unlabelled and lack `aria-current`** — `layout.js:70,74` create two sibling
   `<nav>`s with no distinguishing label; the active item is a CSS class only.
9. **No `aria-pressed`** on the theme toggle.
10. **Buttons created via `createElement('button')` never set `type`**, defaulting to `submit`:
    `batchRow.js:6`, `card.js:23`, `partyRow.js:13`, `kebabMenu.js:12`, plus
    `lineItemRow.js:64`'s `.line-remove`. Harmless today (none currently sit inside a `<form>`)
    but a latent bug, and inconsistent with `quickPickNumberField.js:26` which does set it.
11. **No shared dialog focus management** — no focus trap or restore helper.
12. **No skip link** anywhere.
13. **No `aria-busy`** anywhere (§1.7).

### 3.8 Performance observations

The app is a no-build MPA with no bundler, so there is no bundle-duplication risk. Observed costs
are structural rather than measured hot spots:

- **`createDataTable.setRows` clears via `listEl.innerHTML = ''`** (`dataTable.js`), discarding
  listeners with no teardown hook. Correct today because rows use direct handlers, but it forces
  full re-render on every update.
- **Search has no request sequencing** (§1.7 item 5) — out-of-order responses can overwrite newer
  results. A correctness issue as much as a performance one.
- **No layout-shift protection.** Because there is no skeleton, every list load shifts layout from
  zero-height to full-height in one frame. The loading infrastructure in this milestone
  addresses this directly.
- **`initKebabAutoClose()` attaches a document-level click listener per page** — one listener,
  correctly scoped; no leak.
- DOM complexity is low; no screen exceeds a few hundred nodes.

---

## Part 4 — Migration Strategy for 13B and later

13A migrates **`stock.html` only**, as the reference screen. The remaining screens are ordered
below by ascending risk, with the specific work each needs. **No screen below is modified in 13A**
(other than the three narrowly-scoped `chooseBatch` call sites in §1.9, which are a shared-layer
defect fix, not a migration).

| Order | Screen | Risk | Work required |
|---|---|---|---|
| 1 | `menu.html` | **Lowest** | Delete ~90% of its `<style>` block (re-implements `.item-row`); adopt the page-header factory; **add a toaster** — it currently has none (§1.8). No dialogs, no forms, no save path. |
| 2 | `items.html` | Low | Page header, dialog shell ×2, `setButtonBusy`, segmented toggle (`.kind-toggle`), skeleton on list load. Fix the swallowed error at `:297-300` and the four unstyled `.fg-title` headings. |
| 3 | `suppliers.html` | Low | Page header, dialog shell ×2, `setButtonBusy`, skeleton, `.detail-row` → shared record-detail pattern. Resolve the untokenised `0.04em` tracking. |
| 4 | `index.html` | Medium | The structural outlier (§1.3): adopt `initShell`, replace the inline-styled topbar div with `.topbar-right`, migrate legacy alias tokens to `--color-*` roles, fix the non-rethemeing `.btn-new` shadow, drop the local `escape()` in favour of `js/ui/escape.js`. Gate/auth flow needs care. |
| 5 | `manufacturing.html` | Medium-high | Page header, dialog shell, results-row factory ×2, segmented toggle, `setButtonBusy`. Untangle the page-local vs inline style conflict at `:18`/`:77`. |
| 6 | `sale.html` | **Highest** | Money path. Page header (Shape B), dialog shell ×4, results-row factory, segmented toggle, `setButtonBusy`, skeleton. |
| 7 | `purchase.html` | **Highest** | As sale, plus the most tangled dialog hand-off logic in the repo (6 `showModal()` / 9 `close()`). |

**Cross-cutting items for 13B+, not tied to one screen:**

- Build the **segmented toggle** and **search-results row** factories when their first consumer
  migrates (items.html and manufacturing.html respectively) — deliberately not built in 13A,
  since neither is exercised by the reference screen and building them without a consumer would
  be speculative.
- Consolidate the 6 duplicate `fmt` currency formatters and 8 duplicate `$` helpers into a shared
  utility.
- Standardise error copy across the 8 prefix conventions found in §1.8.
- Add request sequencing to the debounced search paths (§3.8).
- **Resolve the DS §9 vs §16 touch-target conflict** (§3.6) — a governance decision that should
  precede any screen migration that touches control sizing.
- **Resolve `.loyalty`'s `#E7D9B5`** (§3.2) — open since 8.3.

---

*End of audit. Deliverables 1–3 complete. Implementation record: `milestone-13A-completion.md`.*
