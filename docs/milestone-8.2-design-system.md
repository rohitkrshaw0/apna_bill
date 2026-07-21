# ApnaBill — Design System (Milestone 8.2)

**Status:** The visual/interaction single source of truth for ApnaBill V2.0. Implements
Milestone 8.1 §13. **This milestone formalizes the existing design language; it does not
redesign it.**
**Scope:** design tokens + rules only. No component rewrites, no page migrations, no workflow,
navigation, business-logic, or backend changes. Additive CSS tokens only, each grep-verified
against a value already in use. Zero visual regression.

> **Fidelity contract.** Every token and rule here is derived from a value that already exists in
> `css/shared.css`, cited with its exact consumer selector(s). Nothing invents an aesthetic. Where
> more than one literal exists for a concept, **both are documented and both get tokens** — nothing
> is silently normalized. Where a component's current value differs from a token, the component is
> authoritative until 8.3 migrates it with explicit sign-off for anything that isn't an exact-value
> swap (see §20).
>
> **Immutability contract.** Once approved, this Design System is a **stable platform, not a
> living draft** — treat it with the discipline of a database schema or public API: every future
> screen depends on it, so changes require explicit approval, not incidental edits. The full,
> authoritative policy is §21 — Design System Change Policy.

---

## 1. Design Philosophy

ApnaBill must feel **fast, calm, professional, confident, and trustworthy** — never busy,
crowded, heavy, technical, or overwhelming. Every screen should make the user think *"I know
exactly what to do."*

This is expressed through a deliberate **"paper & ink ledger"** identity already present in the
product: warm off-white paper surfaces (`--paper`), near-black ink text (`--ink`), thin rules
instead of heavy borders, a single green "stamp" accent for the primary path, and monospace
tabular figures for every number that matters. The visual system's job is to protect that calm:
reduce cognitive load, make hierarchy legible without reading, and behave identically everywhere.

Three enduring rules govern every decision below:
1. **Meaning over decoration** — color, weight, and space encode importance, never ornament.
2. **Consistency over variety** — one token, one component, one behavior, reused everywhere.
3. **Mobile-first, desktop-amplified** — the phone is the design target; desktop reveals more of
   the same system, never a different one.

---

## 2. Design Language

- **Visual rhythm & density.** Comfortable, not dense. Content breathes on the spacing scale
  (§4). List rows and cards use generous vertical padding (12–16px) so touch targets stay large
  and scanning stays easy. Density increases on desktop by *adding* whitespace/columns, never by
  shrinking type.
- **Whitespace philosophy.** Whitespace is the primary grouping device: related things sit close
  (`--space-4/6/8`), sections separate with more room (`--space-16/20/24`), screen gutters are a
  fixed `--gutter` (= `--space-20`). Prefer space over borders for grouping.
- **Surface & card philosophy.** Information lives on `--paper` surfaces bounded by a thin
  `--rule` border and `--r-lg` corners. Elevation is rare and meaningful — flat by default, a soft
  shadow only for things that float above the page. See §7.
- **Card philosophy.** A card is a single scannable unit: bold `--ink` title, muted meta line, at
  most one trailing value/action. Purpose is communicated by content and shape, not color fills.
- **Interaction & touch philosophy.** One-handed, thumb-first. Primary actions are large
  (`--tap`/`--btn`, 56–60) and anchored low; every control clears the 44px minimum; repeated
  actions are placed for speed, not precision. See §16.
- **Typography philosophy.** Two families only — `--font-sans` for UI, `--font-mono` for every
  number — so amounts and quantities are always comparable and aligned. See §5.
- **Information emphasis.** Built from three levers only: color, weight, size (§5/§6). One accent
  per view, one primary action per screen — nothing competes.

---

## 3. Visual Hierarchy

Without reading text, a user must instantly identify each layer. Mechanism already in the app:

| Layer | How it's signaled |
|---|---|
| **Primary action** | Solid `--color-primary` fill, `--color-on-accent` text, largest control height (`--btn`/`--tap`), anchored bottom |
| **Primary information** | `--color-text`, weight 600–700, `--text-16`→`--text-24` |
| **Secondary information** | `--color-text-2`/`--color-text-muted`, weight 400–500, `--text-13`/`--text-14` |
| **Status** | Semantic soft chips/badges (§6): success `--color-success-soft`, warning/info `--color-warning-soft`, danger `--color-danger-soft` |
| **Warning / danger** | `--color-warning` (caution) / `--color-danger` (destructive, money owed) |
| **Totals / amounts** | `--font-mono`, tabular figures, `--color-text`, grand total largest (`--text-22`, `--weight-bold`) |
| **Navigation** | Sidebar (desktop) / bottom-nav (mobile); active item `--color-primary` |
| **Context** | Muted uppercase micro-labels (`--text-11`/`--text-12`, `--tracking-caps`/`--tracking-label`) |

**Rule:** exactly one Primary action and one accent focus per view. If two things look primary,
demote one to ghost/secondary.

---

## 4. Spacing System

### What & why
A scale naming every `padding`/`margin`/`gap` pixel value found in `shared.css` by grep audit —
not an invented 8-point or 4-point grid. Token name = literal pixel value, so there is no
ambiguity about what a token means or whether it matches an existing rule.

### The scale (audited)

| Token | px | Representative consumers (not exhaustive) |
|---|---|---|
| `--space-2` | 2 | badge/batch-tag padding, `.field-required` margin, meta-line margin-top |
| `--space-3` | 3 | `.bn-item` gap, item/stock-batch-row `.meta` margin-top |
| `--space-4` | 4 | `.h1` margin, `.field`/`.form-grid label` gap, several `-4px` nudges |
| `--space-6` | 6 | `.chip`/`.back-btn` gap, `.quick-pick-chips` gap, `.results` margin-top |
| `--space-8` | 8 | the single most common gap/padding value app-wide (20+ consumers: `.card-actions`, `.line-controls`, `.batch-fields`, `.totals`, `.chk-row`, `.filter-row`, …) |
| `--space-10` | 10 | `.brand` gap, `.sheet-actions` gap, `.mini-totals` gap, `.amount-row` gap |
| `--space-12` | 12 | `.topbar`/`.list`/`.card` gap, `.panel` — second most common value |
| `--space-14` | 14 | `.sheet` gap, `.cart-line` padding, `.result-row` padding, several `margin-bottom` |
| `--space-16` | 16 | `.topbar`/`.card`/`.item-row` padding, `body.stock-app .sheet` gap |
| `--space-18` | 18 | `.card` padding (2nd value), `.drill-header .meta` margin-bottom, `.summary-row` padding |
| `--space-20` | 20 | **= `--gutter`.** `.wrap`/`.side-col`/`.save-bar`/`.sidebar` padding — the screen-gutter value |
| `--space-22` | 22 | base `.sheet` padding, `.result-empty` padding — **note:** a distinct, separate value from `--space-20`; `body.cart-app .sheet` overrides to 20 for cart-page dialogs specifically. Both are real and kept distinct. |
| `--space-24` | 24 | `.wrap` top padding, `.empty` padding, `.summary-row` gap |
| `--space-40` | 40 | `.empty`/`.cart-empty` padding (empty-state convention) |

### Structural offsets — deliberately NOT tokenized as spacing

`42px`/`44px` (search-icon left-clearance padding), `60px` (mobile `.save-bar` bottom margin,
clearing the bottom-nav), `120px`/`260px` (`.wrap`/`.cart-col` bottom padding, clearing fixed
save/nav bars). Each of these expresses a sizing **relationship to another fixed element**, not a
spacing rhythm — tokenizing them as generic spacing would misrepresent that relationship and risk
a future edit silently decoupling, e.g., the cart column's bottom padding from the actual height
of the bar it's reserving room for. They stay literal, next to a comment citing what they clear,
exactly as today. (`240px`, the sidebar's own width, is *not* in this exception list — it's
tokenized as `--nav-sidebar-width` under Navigation dimensions, §13, since it's the dimension
itself rather than another element's clearance, and is already written twice.)

### When to use / when not to use

Use a `--space-*` token for any new padding/margin/gap that matches one of the values above
exactly. **Do not** pick the "nearest" token for a value that doesn't match — that's normalization,
explicitly out of scope for 8.2/8.3 (flag it for a product decision instead, per the 8.1-authority
rule). Do not use `--space-*` for a value that expresses a relationship to another element's fixed
size (a "structural offset," above) — use a literal with a citing comment instead, as today.

---

## 5. Typography System

### What & why
Two font families and one size scale, both audited from `shared.css`'s actual `font-family`/
`font-size` declarations — not a designed type ramp.

### Families

| Token | Value | Consumers |
|---|---|---|
| `--font-sans` | `"IBM Plex Sans", system-ui, -apple-system, sans-serif` | `body` (all UI text) |
| `--font-mono` | `"IBM Plex Mono", ui-monospace, Menlo, monospace` | `.mono` utility |

**Documented duplicate:** ~10 rules (`.money`/`.lineno`, `.line-total`, `.stock-chip`,
`.picker-list .bal`, `.batch-row .stock`, `.save-btn .save-total`, `.summary-stat .stat-value`,
`.ledger-qty`, line-item numeric inputs) use the **shorter** literal `"IBM Plex Mono", monospace`
— missing the `ui-monospace, Menlo` fallback the `.mono` utility has. `--font-mono` is set to the
**fuller** literal because it's the one canonical reusable utility class already models; the
short-form instances are flagged here for 8.3 to migrate onto the token (strictly additive
robustness — adds fallback fonts that only matter if IBM Plex Mono fails to load; not a visible
change on any environment where it currently loads).

**Numeric rule (non-negotiable):** every comparable number — amounts, quantities, rates, stock,
line totals, ledger dates — uses `--font-mono` with `font-variant-numeric: tabular-nums`,
right-aligned in columns. This is core to the ledger identity and to fast counter scanning. Do
not use `--font-mono` for non-numeric text (defeats its purpose as a scanning signal).

### Size scale (audited — 13 distinct literal values, none merged)

| Token | px | Consumers (role) |
|---|---|---|
| `--text-10` | 10 | `.bn-item` (bottom-nav label) — singleton, kept distinct from 11 |
| `--text-11` | 11 | `.badge`, `.line-controls .field-label`, `.mini-totals .lbl`, `.summary-stat .stat-label`, `.ledger-type` |
| `--text-12` | 12 | `.field-help`/`.field-error`, `.cart-header`, `.panel-title`/`.side-title`, `.tax-mode-hint`, `.ledger-date`, `.brand-crumb` (cart/stock) — ~10 consumers |
| `--text-12-5` | 12.5 | `.item-row .meta`, `.stock-batch-row .meta`, `.ledger-notes` — a real recurring "list-row meta" size, kept distinct from 12 and 13 |
| `--text-13` | 13 | the dominant "secondary/meta" size — `.brand-crumb`, `.sheet .sub`, `.field`, `.chip`, `.back-btn`, `.party-meta`, `.due-hint`, `.filter-pill`, `.btn-mini`, `.ledger-row`, ~20 consumers |
| `--text-14` | 14 | `.sub`, `.toast`, `.total-row`, `.lineno`, `.back-link`, `.adjust-preview`, `.stock-chip` |
| `--text-15` | 15 | root `html` size, `.btn`, `.line-main .line-name`, `.item-row .name`, `body.stock-app input.search` |
| `--text-16` | 16 | `.party-name`, `.line-total`, `.save-btn`, `body.cart-app .search` |
| `--text-17` | 17 | `.card .co-name`, `.btn-gen` |
| `--text-18` | 18 | `.empty h3`, `.total-row.grand`, `.sidebar-brand` |
| `--text-20` | 20 | `.brand-name`, `.sheet h2`, `.save-btn .save-total`, `.summary-stat .stat-value`, `.chevron` |
| `--text-22` | 22 | `.total-row.grand .v`, `.drill-header h2` |
| `--text-24` | 24 | `.h1` |

### Weights

`--weight-medium` 500, `--weight-semibold` 600, `--weight-bold` 700 — every value literally
written in `shared.css` today. **400/"regular" is intentionally not tokenized:** it is never
explicitly declared anywhere (body text relies on the browser default via inheritance); if 8.3
ever needs to state it explicitly, use the `normal` keyword rather than inventing a token for a
value that has no literal today.

### Line-height & letter-spacing

`--leading-body: 1.4` — the one explicit line-height in the file (`body`), inherited app-wide.

Five distinct `letter-spacing` literals exist; **all five are kept, none merged**:

| Token | Value | Consumers |
|---|---|---|
| `--tracking-tight` | -0.01em | `.h1`, `.brand-name`, `.sidebar-brand` |
| `--tracking-wide-05` | 0.05em | `.ledger-type` (singleton) |
| `--tracking-label` | 0.06em | `.badge`, `.line-controls .field-label`, `.mini-totals .lbl`, `.summary-stat .stat-label` |
| `--tracking-wide-08` | 0.08em | `.cart-header` (singleton) |
| `--tracking-caps` | 0.1em | `.panel-title`, `.side-title` |

### When to use / when not to use

Match a `--text-*` token to an *exact* existing size. A new size need that falls between two
tokens (e.g. wanting "something around 13.5px") is a new product/visual decision — stop and ask,
don't interpolate. Always pair `--font-mono` with `font-variant-numeric: tabular-nums` for
numbers; never use it as a decorative/branding font.

---

## 6. Color System

Semantic roles mapped onto ApnaBill's existing three-accent palette. **Shared hues are
intentional brand identity** — the product deliberately speaks with one green, one red, one amber
across two roles each. All roles alias theme-aware base tokens, so dark mode is automatic.

| Role | Token | Base (light → dark) | Meaning | When to use |
|---|---|---|---|---|
| Primary | `--color-primary` | `--stamp` #2A5F4F → #3FA07F | The main path / brand accent | The one primary action/accent per screen |
| Primary soft | `--color-primary-soft` | `--stamp-soft` | Tinted primary bg | Selected/current state, soft chips |
| Success | `--color-success` | `--stamp` (same as primary, by design) | Positive/confirmed | Confirmation text/icon, never for the primary action fill just because it's also green — use `--color-primary` there for clarity of intent even though the value is identical |
| Danger | `--color-danger` | `--madder` #A83232 → #D9695C | Destructive, money owed, negative stock | Delete confirms, due/payable amounts |
| Danger soft | `--color-danger-soft` | `--madder-soft` | Danger backgrounds | Due-hint banners, remove-hover |
| Warning | `--color-warning` | `--gold` #C88A2E → #D2A054 | Caution — low stock, attention | Low-stock chips, caution banners |
| Information | `--color-info` | `--gold` (same as warning, by design) | Informational accent | Loyalty/info badges |
| Warn/Info soft | `--color-warning-soft`/`--color-info-soft` | `--gold-soft` | Tinted amber bg | Loyalty panel, info badge |
| Secondary | *(no hue token)* | ghost/outline: transparent + `--color-border-strong` + `--color-text` | Lower-priority actions | Cancel, non-primary buttons — deliberately carries no brand fill |
| Neutral bg/surface | `--color-bg`/`--color-surface` | `--paper` | Page & card surface | Default surface |
| Surface-2 | `--color-surface-2` | `--paper-2` | Recessed surface | Side column, summary rows |
| Border / strong | `--color-border`/`--color-border-strong` | `--rule`/`--rule-strong` | Hairlines / input borders | Default dividers vs emphasized/input borders |
| Text / text-2 / muted | `--color-text`/`--color-text-2`/`--color-text-muted` | `--ink`/`--ink-2`/`--muted-ink` | Primary/body/meta text | Per hierarchy in §3 |
| On-accent | `--color-on-accent` | #fff | Text/icons on solid fills | Any text sitting on a `--color-primary`/`--color-danger` fill |

**Do not** introduce a new hue to fill a role that already has one (e.g. a distinct blue "info" or
distinct green "success") — that changes the app's visual identity and is out of scope; flag it as
a product decision if it's ever proposed (8.1-authority rule).

**Dark mode:** every base token already has a dark value (`prefers-color-scheme` + `data-theme`);
every role above aliases those, so no separate dark palette needs maintaining. The sidebar stays
intentionally dark in both themes — documented identity, not a bug.

---

## 7. Surface System

| Surface | Border | Radius | Elevation |
|---|---|---|---|
| Card / list row | 1px `--color-border` | `--r-lg` | Flat |
| Panel | 1px `--color-border` | `--r-lg` | Flat |
| Recessed surface | none/`--color-border` | `--r-lg` | `--color-surface-2`, flat |
| Dialog (`<dialog>`) | none | `--r-lg` | `--shadow-sheet`; backdrop `rgba(20,22,26,.4)` |
| Dropdown/results | 1px `--color-border` | `--r-md` | `--shadow-sheet` |
| Save bar | top `--color-border` | — | `--shadow-panel` (mobile only) |
| Bottom-nav | top `--color-border` | — | Flat, fixed |
| Sidebar | none | — | Fixed, dark chrome |

**Radius:** `--r-sm` 4 / `--r-md` 8 / `--r-lg` 12 (unchanged, already named) plus the new
`--r-pill: 999px` — 6 existing consumers (`badge`, `quick-pick-chips button`, `batch-tag`,
`pay-pill`, `filter-pill`, `ledger-type`) that today write `999px` with no name. **Elevation:**
exactly two shadows, `--shadow-panel` (subtle lift, sticky bars) and `--shadow-sheet` (floating
overlays) — both already tokens, unchanged. Selection is a **ring**
(`--ring-selected: 0 0 0 2px var(--stamp-soft)`, from `.card.current`), not a shadow. **Focus:**
`--focus-border` (`.stamp`) + `--focus-ring` (`0 0 0 3px var(--stamp-soft)`), both from the
existing `input:focus` rule.

**Layer hierarchy (z-index, every distinct value in the app):** `--z-sticky` 5 <
`--z-savebar` 10 < `--z-minitotals` 15 < `--z-menu` 20 < `--z-bottomnav` 50 < `--z-sidebar` 60 <
`--z-toast` 100 < `--z-gate` 200. (`--z-gate`'s source is `index.html`'s own `<style>` block, not
`shared.css` — noted since the token itself now lives in the shared file.) Each rung is a
singleton rule today (that's how a stacking order works); kept as tokens because the *ordering
itself* — not any individual number's frequency — is the foundational, reusable primitive: any
new floating element 8.3–8.6 introduces must be placed correctly against this existing stack.

**Dialog dimensions:** `--dialog-max-w` 560 (base `dialog` rule) and `--dialog-max-w-compact` 520
(`body.cart-app dialog` — intentionally narrower for cart-page pickers) are two distinct existing
sizes, kept distinct. `--dialog-max-h` 92vh (`body.stock-app dialog`) bounds list-page dialogs so
their content scrolls instead of overflowing the viewport.

**Navigation dimension:** `--nav-sidebar-width` 240 — the desktop sidebar's own width, already
written twice (`.sidebar`'s `width` and the `body.cart-app, body.stock-app` `margin-left` that
clears it).

**When not to use:** don't add a new elevation/shadow value for a "in-between" case — the system
deliberately has exactly two; a perceived need for a third is a product/visual decision to flag,
not something to add ad hoc.

---

## 8. Card System

All cards share the §7 surface (paper, `--color-border`, `--r-lg`) and differ only by content role:

| Card type | Purpose | Anatomy | Example today |
|---|---|---|---|
| Entity card | A record in a master list | Title (`--color-text`, 600, `--text-16`) + meta (`--color-text-muted`, `--text-13`) + trailing value/kebab | company card, item-row, supplier row |
| Selection card | Pick / current-state affordance | Same, plus `--ring-selected` when current; dashed border + muted when empty | party/supplier/produced-item picker |
| Statistic card | A single number to read | Uppercase micro-label (`--text-11`, caps) + mono value (`--text-20`, 700) | stock drill summary stats |
| Transaction card | A line/record in a transaction | Line no (mono, muted) + name + mono line total; disclosed controls below | cart line, ledger row |
| Action/menu card | A navigable destination | Icon tile (`--color-primary-soft`) + name + meta + chevron | menu.html rows |
| Summary card | Grouped read-only figures | `--color-surface-2` recessed, stat rows | drill summary, cost summary |

**Rule:** a card states purpose through content and shape, never a colored fill. At most one
trailing action/value; everything else is disclosed on tap.

---

## 9. Button System

| Variant | Style | Use | Height |
|---|---|---|---|
| Primary | `--color-primary` fill, `--color-on-accent` text, `--weight-semibold` | The one primary action | `.btn` 48; save `--btn` 60 |
| Secondary/Ghost | transparent, `--color-border-strong` border, `--color-text` | Cancel, low-priority | 48 |
| Danger | `--color-danger` fill, #fff | Destructive confirm | 48 |
| Soft/mini | `--color-primary-soft` bg + `--color-primary` text | In-context accents (Adjust, add-new) | `--control-34`/`--control-36` |
| Icon | 40×40 (36 on list pages), `--r-md`, hover `--color-surface-2` | Kebab, theme, sign-out, back | `--control-40`/`--control-36` |
| FAB | `--color-primary` fill, `--r-lg`, shadow, fixed bar | "New" primary on list screens | 56 |
| Split/total | Grid `1fr auto`: label + mono total | Save + live total | `--btn` 60 |
| Loading | Disabled + swap label ("Creating…") | Async submit | inherits |
| Disabled | `--color-border-strong` bg, `--color-text-muted` text | Blocked action | inherits |

**Priority & placement:** one primary per screen, anchored bottom on mobile, right-most in dialog
action rows (`.sheet-actions`, Cancel ghost + Save primary). **Touch:** all buttons ≥
`--control-34`; primary/repeated ≥ `--tap`/`--btn`. **States:** hover (fill brighten /
`--color-surface-2`), `:active` `scale(0.98)` over `--dur-fast` on the save button, focus per §7,
disabled per above. **Radius:** `--r-md` standard, `--r-lg` for primary save/FAB, `--r-pill` never
on buttons (pills only, §7).

---

## 10. Form System

Builds on the existing **Form Framework** (`js/ui/forms/`, `docs/FormFramework.md`) — this
milestone documents its visual standard, does not change it.

| Element | Standard |
|---|---|
| Input/textarea/select | `--control-44` default height, `--color-surface` bg, 1px `--color-border-strong`, `--r-md`, 14px horizontal padding |
| Label | `--text-12`/`--text-13`, `--color-text-2`, above control |
| Required marker | `--color-primary` asterisk after label |
| Helper text | `--text-12`, `--color-text-muted` |
| Validation error | `--text-12`, `--color-primary` (accent, not red — matches existing), slot collapses when empty |
| Focus | `--focus-border` + `--focus-ring` |
| Read-only | native `readonly`, visually normal |
| Disabled | native `disabled`, muted |
| Search | leading icon; `--tap`/`--r-lg` on cart pages, `--control-48` on list pages |
| Currency | `currencyField`: `inputmode=decimal`, `step=0.01`, mono, right-aligned |
| Number/stepper | `numberField`; line-item numeric inputs mono + right-aligned |
| Quick-pick chips | `--control-30` pill row, active = `--color-primary` fill |
| Date | native date input; `minmax(0,1fr)` grid guard prevents overflow |
| Barcode | generate-only today; **scanning is Planned per 8.1 §6, not built here** |
| GST | `gstRateField` fixed picks `[0,5,12,18,28]` |

**Rules:** ask the minimum required; smart defaults everywhere; progressive disclosure of
advanced fields; autofocus the field that starts the task; consistent dialog chrome (title →
fields → `.sheet-actions`). Field label/error/help markup is produced centrally by `renderField`
— never hand-built.

---

## 11. List System

| List type | Pattern | Density |
|---|---|---|
| Master list | `.list` grid, `--space-10`/`--space-12` gap, entity cards | Comfortable |
| Transaction list | `.cart-list`: header row + `.cart-line` rows, `--color-border` separators | Comfortable, mono totals |
| Search results | `.results` dropdown, `--r-lg`, hover `--color-surface-2`, tap-to-add | Compact, `--tap` min row height |
| Picker list | `.picker-list` scroll area | Compact |
| Batch list | `.batch-row` (picker) / `.stock-batch-row` (card) | Compact/comfortable |
| Grouped list | Uppercase muted section titles (`--tracking-caps`) | — |
| Ledger list | `.ledger-row` grid, mono qty in/out colored `--color-success`/`--color-danger` | Compact |
| Filter/segment row | `.filter-pill` row, active = `--color-primary` | — |

**Status indicators:** low/severe stock = `--color-warning`/`--color-danger` mono chip; balances =
`--color-danger` for "owes," neutral for advance; badges per §6. **Rules:** one row = one tappable
unit; primary info left, value/status right; row action is drill-in or a single trailing control;
selection uses `--ring-selected`.

---

## 12. Dialog System

- **Element:** native `<dialog>` (`.showModal()`), `--color-surface`, `--r-lg`, `--shadow-sheet`,
  backdrop `rgba(20,22,26,.4)`. **Two real width caps exist:** `--dialog-max-w` (base) and
  `--dialog-max-w-compact` (`body.cart-app dialog`) — both kept distinct, not merged. Mobile:
  full-width, `--dialog-max-h` scroll on list-page dialogs.
- **Anatomy (`.sheet`):** padding `--space-22` base / `--space-20` on cart-page dialogs (§4 — a
  documented, real distinction), `gap` `--space-14`; `h2` (`--text-20`, `--color-text`) → optional
  `.sub` (`--color-text-muted`, `--text-13`) → fields → `.sheet-actions` (right-aligned, `gap`
  `--space-10`, Cancel ghost + primary/danger Save).
- **Bottom sheets:** the mobile totals/payment expander (`#mini-totals` → panel) is the current
  bottom-sheet analogue; no new component — formalized as sticky trigger + expanding panel.
- **Behavior:** autofocus primary field on open; `method="dialog"` + `preventDefault` submit;
  destructive confirms require typed confirmation for high-stakes deletes (company delete).
- **Rules:** dialogs are for focused create/edit/confirm, never multi-step wizards (8.1 §12 R3).

---

## 13. Navigation Visual Language

Formalizes 8.1 §4; **no navigation change**, visual spec only.

- **Desktop sidebar (≥900px):** fixed `--nav-sidebar-width` (240), dark chrome in both themes
  (`#14161A`), items `--control-44` `--r-md`, active `--color-primary` fill, hover
  `rgba(255,255,255,.06)`. `--z-sidebar`.
- **Mobile bottom-nav (≤899px):** fixed 4-tab grid, `--color-surface`, top `--color-border`,
  `env(safe-area-inset)`, icon 21px + `--text-10` label, active `--color-primary`. `--z-bottomnav`.
- **Topbar:** brand/company (ellipsized) + crumb, back button (icon+label, label hides <480px),
  context chips, theme toggle. Chips: `--color-surface-2`, `--r-md`, `--control-36`.
- **Active/selected:** always `--color-primary`. **Rules:** Tier-1 destinations one tap away; the
  4-slot mobile cap is a hard constraint (8.1 §4.2); nav chrome placement fixed and predictable.

---

## 14. Iconography

Single source: `icon(name, opts)` in `js/ui/icons.js`. **No hand-copied SVGs — ever.**

- **Style:** Feather-style line icons — `viewBox 0 0 24 24`, `fill:none`, `stroke:currentColor`,
  `stroke-width:2`, round caps/joins.
- **Sizing:** default 18; 14 in chips, 16 in back/inline, 20–21 in sidebar/bottom-nav, 18 in menu
  tiles. Icons inherit color via `currentColor` (theme/state-match automatically).
- **Usage:** decorative icons `--color-text-muted`; interactive icons take the control's color and
  its 40/36px tap target. **Alignment:** vertically centered with adjacent text, `--space-6` gap.
  **Consistency:** one icon per concept; new icons only added to `ICON_PATHS`, same stroke system.

---

## 15. Motion

### What & why
Two duration tokens and one easing, matching the **single explicit CSS transition in the app
today** — `.save-btn`'s `transition: transform 100ms ease, background 200ms ease`. This is a
narrow, honest provenance: motion in ApnaBill is currently almost entirely native browser/element
behavior (`<dialog>` show, `display` toggles, sticky scroll), not custom-animated. The tokens exist
to name the one place custom timing is used today, and to give 8.3 a consistent name to reach for
if it adds comparable feedback elsewhere — not to imply a broader motion system already exists.

| Token | Value | Consumer | When to use |
|---|---|---|---|
| `--dur-fast` | 100ms | `.save-btn` transform | Instant-feeling state feedback (press, toggle) |
| `--dur-base` | 200ms | `.save-btn` background | Color/background transitions |
| `--ease-standard` | ease | `.save-btn` (both) | Default easing for both durations above |

**When not to use:** no decorative/looping animation; nothing blocks input; honor
`prefers-reduced-motion` by disabling non-essential transforms (§18). Prefer instant, legible
feedback over choreography — this is a calm-counter tool, not a marketing surface.

---

## 16. Touch Guidelines

- **Targets:** ≥ `--control-44` for any tap; primary/repeated actions `--tap`/`--btn` (56–60).
- **Reach:** primary actions anchored to the bottom third; destructive/rare actions kept out of
  the thumb's primary arc.
- **Repeated interaction:** item add, qty edit, pickers optimized for speed and low precision
  (large rows, tap-to-add) — the flagship speed work lands in 8.3 per 8.1 §14.
- **Spacing:** ≥ `--space-8` between adjacent targets; large search fields on cart pages (`--tap`).
- **Comfort:** generous `--leading-body` and padding for long standing sessions;
  `env(safe-area-inset-*)` respected on notched phones.

---

## 17. Desktop Enhancement Rules

- **Reveal more, change nothing:** the two-column cart shows the totals the mobile user expands;
  extend this "reveal, don't restructure" rule to future screens.
- **Whitespace & columns:** add gutters/columns at ≥900px; never shrink type or density to fit.
- **Persistent panels:** sidebar nav and sticky totals aside are desktop-only affordances.
- **Keyboard & focus:** visible `--focus-ring` on every control; logical tab order; Enter submits
  dialogs; keyboard-driven add on Sale is the desktop analogue of the mobile speed fix (Planned,
  8.1 §10) — spec only, not built here.
- **Hover:** an enhancement, never the only affordance — everything works by tap.

---

## 18. Accessibility Standards

- **Contrast:** ink-on-paper and accent fills meet AA for body text; soft tints for backgrounds
  only, never for small text on paper.
- **Keyboard:** every interactive element focusable/operable; `--focus-ring` always visible;
  dialogs trap focus natively.
- **Screen readers:** meaningful labels on icon-only buttons (`aria-label`); `.sr-only` for
  visually-hidden text (e.g. collapsed back-button label).
- **Reduced motion:** wrap the §15 transitions in `@media (prefers-reduced-motion: reduce)` to
  disable transforms.
- **Touch accessibility:** 44px minimum targets (§16).
- **Typography:** 15px base, `--leading-body` 1.4, tabular figures for comparability; never rely
  on color alone for status (pair with icon/text/badge).

---

## 19. Component Consistency Rules

Every component obeys the same foundations — no exceptions:
- **Color** only via §6 role tokens (never a raw hex, except documented sidebar chrome and
  `--color-on-accent`). **Spacing** only via §4. **Type** only via §5. **Radius/elevation/z-index**
  only via §7. **Motion** only via §15. **Focus** only via §7/§12.
- **Icons** only via `icon()`. **Forms** only via the Form Framework. **Numbers** always
  `--font-mono` + tabular. **Primary action** exactly one per view.
- Buttons, dialogs, forms, cards, lists, search, pickers, menus, badges, chips, and pills all draw
  from this single token set so every screen reads as one product.

---

## 20. Implementation Requirements for Milestone 8.3

1. **Exact-match migration only.** Replace a hardcoded value with the token of identical value
   (e.g. `padding:20px` → `var(--space-20)`; `font-size:15px` → `var(--text-15)`;
   `z-index:60` → `var(--z-sidebar)`). Zero visual change, by construction.
2. **No silent normalization.** A value with no exact token (none exist today — the audit in §4/§5
   was exhaustive) must not be snapped to the nearest token. If 8.3 discovers a value this audit
   missed, add its token then, cited the same way — don't approximate.
3. **Resolve the documented duplicates deliberately, not by default.** The two `.sheet` padding
   values (20 vs 22), the two mono font-family literal forms, and the five distinct
   letter-spacing values are all real and all have tokens — 8.3 keeps them distinct per-context
   exactly as cataloged here unless a product decision explicitly unifies them (8.1-authority
   rule: that would be a visual change requiring sign-off, not a token migration).
4. **Roles over raw palette.** Consume `--color-*` role tokens in components, not `--stamp`/
   `--madder`/`--gold` directly.
5. **Retire legacy classes** (`.gst-quick`, `.code-row`, `.chk-row`) only as their consumers
   migrate to the Form Framework equivalents, never by breaking a page.
6. **Per-change visual verification** on desktop/tablet/mobile × light/dark (Playwright, same
   method as this milestone's Verification); treat any unintended pixel shift as a regression.
7. **Order of migration** follows 8.1 §14 priority (counter-speed work first) — 8.3 is a pure
   token/CSS migration; it introduces no product or workflow change.
8. **This Design System is immutable once approved.** 8.3–8.6 consume §1–§20; they do not add new
   tokens, color roles, component categories, or visual rules as a side effect of building a
   screen. The full governance procedure — including what to do when a real gap is found — is
   §21, Design System Change Policy. Read it before starting 8.3.

---

## 21. Design System Change Policy

**This Design System is a stable public API for the ApnaBill frontend.** Every screen in 8.3–8.6
is a *consumer* of it, the same way a client consumes a versioned backend API — not a co-author of
it. The following rules are binding for every milestone from 8.3 onward, with no exceptions
carved out by convenience or deadline pressure.

1. **No new design tokens without explicit approval.** 8.3–8.6 may not introduce a new spacing,
   type, color, motion, elevation, radius, z-index, dialog, or navigation-dimension token. Every
   token this system will ever need for the current scope is already defined in §4–§7 and §15.
   Needing a value not listed there is a signal to stop, not a reason to add one.
2. **Existing tokens may be consumed, never renamed.** A component migrating onto
   `var(--space-20)`, `var(--text-15)`, `var(--color-danger)`, etc. must reference the token by
   its exact name as defined in this document. Renaming a token (even a purely mechanical rename,
   even one that looks clearer) breaks every future reference to this document's tables and is
   out of scope for 8.3–8.6.
3. **Existing token semantics may not change.** A token's meaning, role, and value are fixed as
   documented in §4–§7 and §15. `--color-danger` stays "destructive, money owed, negative stock";
   `--text-13` stays 13px; `--dur-fast` stays 100ms. If a screen seems to need `--color-danger` to
   mean something subtly different, that is a new semantic — see rule 5, not a reinterpretation.
4. **Shared components migrate toward the Design System; they do not extend it.** Where §8–§14
   already define a component category (card, button, form field, list row, dialog, nav chrome),
   8.3–8.6 brings existing markup onto that category's documented tokens/rules (per §20's
   exact-match migration). It does not add a new variant, a new size, or a new visual state to a
   component category to solve a one-off screen need.
5. **A real gap gets an amendment request, not an invention.** If a component genuinely cannot be
   expressed using the approved Design System — no combination of §1–§20's tokens, rules, or
   component categories covers what the screen needs — the procedure is always the same: **stop
   implementation on that item, document the gap** (what's needed, the exact value or pattern,
   which existing token/category comes closest and why it still falls short), **and request an
   explicit Design System amendment** before proceeding. Never invent a new primitive, fork an
   existing token, or hand-roll a one-off style to unblock the screen at hand.
6. **Every future visual change cites the section it implements.** A commit, PR, or code comment
   that changes visual styling in 8.3–8.6 states which Design System section and token(s) it is
   applying (e.g. "migrates `.card` padding to `--space-16` per §4/§8"). A visual change with no
   traceable section reference is, by definition, not a pure migration and must be treated as a
   possible new primitive under rule 1 until shown otherwise.
7. **The preview harness evolves only with an approved amendment.** `docs/design-system-preview.html`
   changes in the same change as an approved amendment to this document, never independently —
   it must always remain a faithful, composed-from-real-components reflection of the current
   approved system (per this document's Change 2 constraint from Milestone 8.2), never a second,
   separately-maintained implementation.

**Amendment process, concretely:** stop → write down the gap and why §1–§20 doesn't cover it →
get explicit approval for the specific addition → only then update this document (and, if
relevant, the preview harness and `css/shared.css`'s token block) → resume implementation. Every
step happens in that order; none is skipped because a screen is "almost done" or the gap "seems
small."

*End of Design System.*
