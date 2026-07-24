# ApnaBill — UX Architecture Blueprint (Milestone 8.1)

**Status:** Foundational blueprint for ApnaBill V2.0 (Milestones 8.2–8.6).
**Scope:** UX architecture only. No code, no redesign, no visual styling.
**Backend, business logic, Form Framework, and Search Service are frozen and unchanged.**

---

## 0. How to read this document

This blueprint is evidence-based. It describes what ApnaBill *is* today (with file references),
what it should *become*, and — just as importantly — what it should deliberately *not* become.

Two classification lenses run through the entire document. Every action and every screen is
tagged with them. They are the mechanism that keeps later milestones honest.

**Action tiers** (drives visual priority and placement):

| Tier | Meaning | Placement rule |
|---|---|---|
| **P — Primary** | Performed repeatedly all day | Highest priority; always one tap away; never hidden |
| **S — Secondary** | Performed several times a day | Visible but subordinate to Primary |
| **O — Occasional** | Performed infrequently | Reachable in ≤2 taps; must not compete with the main flow |
| **A — Administrative** | Rare config/maintenance | Deliberately out of the daily path (e.g. under Menu/Settings) |

**Screen / navigation tiers** (drives the target IA):

| Tier | Meaning |
|---|---|
| **① Existing** | Implemented and structurally sound |
| **② Existing — needs UX redesign** | Implemented but the workflow/hierarchy is wrong for the primary user |
| **③ Planned** | Future scope; justified below; not built in 8.1 |
| **④ Rejected** | Deliberately excluded; adds complexity without proportional value |

**The five-condition test.** No feature enters the target architecture unless it satisfies
*all five*: (1) reduces cognitive load, (2) reduces taps or time, (3) improves discoverability
of a real workflow, (4) preserves simplicity, (5) is coherent mobile-first. Anything that fails
is documented in §12 (Explicitly Rejected) with the reason.

---

## 1. Product Philosophy

ApnaBill is a **daily-use business operating system for a shop owner standing behind a counter,
holding a phone in one hand, with a customer waiting.** That single sentence is the design
authority. Everything below derives from it.

ApnaBill's philosophy is defined on its own terms — not by what other billing, POS, or
accounting products do. The principles:

1. **The counter is the product.** The most important moment in ApnaBill is completing a sale
   while a customer waits. Every other screen exists to support or report on that moment. When
   a decision trades counter speed for anything else, counter speed wins.

2. **Speed over feature count.** The measure of a good change is *fewer taps, less typing, less
   scrolling, less thinking* — not more capability. A new feature that adds a screen but does
   not remove friction from a real workflow is a regression, not progress.

3. **Mobile is the product; desktop is an amplifier.** The phone, one-handed, thumb-driven, is
   the primary surface (the app already commits to this: fixed bottom-nav, sticky mini-totals,
   `env(safe-area-inset-*)` handling, breakpoint at 900px in `css/shared.css`). Desktop must
   show *more information* and support keyboard speed — never become a different product or a
   more complex one.

4. **One obvious action per screen.** On any screen the user should never wonder "what do I do
   here?" Each screen has exactly one Primary action that dominates.

5. **Progressive disclosure.** Show only what the current step needs. Advanced fields (batch
   details, tax overrides, references) appear only when relevant — the app already does this in
   places (batch sub-fields only for batch-tracked items) and should do it everywhere.

6. **Confidence through consistency.** Save, Cancel, Back, Delete, Search, and dialogs must
   behave identically everywhere. A cashier learns the app once and is never surprised.

7. **Calm under pressure.** Minimal colour noise, predictable placement, live feedback (running
   totals, live previews). The interface should lower the user's heart rate, not raise it.

**What ApnaBill is *not*:** it is not accounting software, not a general ERP, not an inventory
suite. It will resist features that belong to those categories when they do not serve the
counter. Those refusals are documented, not silent (§12).

---

## 2. Information Architecture

### 2.1 Current-state IA (evidence)

Today the app is a static multi-page PWA (one `.html` per screen; full-page navigation via
`window.location.href`; shared shell built by `initShell()` in `js/ui/layout.js`). The
destinations that exist:

| Screen | File | Tier | Notes |
|---|---|---|---|
| Company picker + Sign-in | `index.html` | ① Existing | True landing; auth gate + company list |
| Sale (New sale) | `sale.html` | ② Needs redesign | Operational home; **create-only** |
| Purchase (New purchase) | `purchase.html` | ② Needs redesign | **Create-only**; lives under Menu |
| Manufacturing (Production run) | `manufacturing.html` | ② Needs redesign | **Create-only**; lives under Menu |
| Stock | `stock.html` | ① Existing | The only browsable transactional data |
| Items | `items.html` | ① Existing | Item master; full CRUD |
| Suppliers | `suppliers.html` | ① Existing | Supplier master; full CRUD + details |
| Menu (overflow hub) | `menu.html` | ② Needs redesign | Placeholder hints at Reports/Firms/Settings |

**Gaps discovered (each is a real workflow problem, not a missing checkbox):**

- **G1 — No transaction history.** Sales, Purchases, and Manufacturing are *create-only*. Once
  saved, a transaction disappears from the UI (form resets; only a toast with the number
  remains — e.g. `sales.js:125`, `sale.html:690`). A shop owner cannot answer "what did I sell
  this morning?", reprint a bill, or correct a mistake. This is the single largest architectural
  gap.
- **G2 — No Customers management.** Customers exist only inside the Sale flow's party picker
  (`#dlg-party`, `sale.html`; `searchParties`/`createPartyQuick` in `js/sales.js:40,44`). There
  is no `customers.html`. Suppliers got a full management screen (`suppliers.html`, recent
  commit) — customers did not. The owner cannot see who owes money, review a customer's history,
  or edit a customer's details outside of making a sale.
- **G3 — No Home/overview.** The landing after choosing a company is the Sale form itself
  (`index.html` → `sale.html`). There is no glanceable "state of my shop today" surface, so
  questions like "how much did I take today?" or "what's low on stock?" have no home.
- **G4 — No Settings.** Company/firm/GST/theme configuration is scattered: created once in the
  New-Company dialog (`index.html`), firm-switched via a topbar chip, theme toggled per page.
  `menu.html:72` explicitly flags Settings as not-yet-built.
- **G5 — Overflow hub is thin.** `menu.html` currently holds only Purchases, Manufacturing,
  Suppliers, with a placeholder note. It is the natural home for Administrative destinations but
  is not yet organised as one.

### 2.2 Target IA (prescriptive, for V2.0)

The target organises destinations by **action tier**, not by database table. It keeps the
existing MPA structure (no SPA rewrite — see §12 R4).

**Tier-1 (daily, bottom-nav / sidebar):** the four things a counter user touches constantly.

| Destination | Tier | Primary purpose | Status |
|---|---|---|---|
| **Home** | Contains P/S | Glanceable daily state + one-tap New Sale | ③ Planned (fills G3) |
| **Sale** | P | Complete a sale fast | ② Redesign |
| **Stock** | S | Look up "do I have it / how much" | ① Existing |
| **Menu** | Hub | Reach everything else | ② Redesign |

> Rationale for the four Tier-1 slots: the counter user's constant loop is *sell → check stock
> → sell*. Items is a master-data screen edited occasionally, not touched every sale, so it moves
> off the daily bar (see §4.3 for the trade-off and why this is a *proposal to validate*, not a
> settled fact — it's the one navigation decision that depends on real usage data).

**Tier-2 (from Home / Menu, ≤2 taps):** frequent but not constant.

| Destination | Tier | Purpose | Status |
|---|---|---|---|
| **Items** | S | Manage the catalogue | ① Existing |
| **Customers** | S | See who owes, review/edit customers | ③ Planned (fills G2) |
| **Sales history** | S | Browse/reopen/reprint past sales | ③ Planned (fills G1) |

**Tier-3 (Occasional, under Menu):**

| Destination | Tier | Purpose | Status |
|---|---|---|---|
| **Purchases** (+ history) | O | Record stock in; browse past bills | ② Redesign + ③ history |
| **Manufacturing** (+ history) | O | Production runs; browse past runs | ② Redesign + ③ history |
| **Suppliers** | O | Manage suppliers | ① Existing |
| **Reports** | O | Day/period summaries | ③ Planned (see §12 for scope discipline) |

**Tier-4 (Administrative, under Menu → Settings):**

| Destination | Tier | Purpose | Status |
|---|---|---|---|
| **Settings** | A | Company/firm/GST/theme/loyalty config | ③ Planned (fills G4) |
| **Firms** | A | Switch/manage firms | ② Redesign (today a topbar chip) |
| **Companies** | A | Switch company / sign out | ① Existing (`index.html`) |

This structure is the contract for §4 (Navigation) and §5 (per-module).

---

## 3. Information Hierarchy (universal rule)

Every screen must express four bands, top to bottom, in this priority:

```
PRIMARY INFORMATION   → what the user came for (the cart, the stock number, the list)
PRIMARY ACTION        → the one obvious thing to do (Create Sale, Add Item, Save)
SECONDARY INFO/ACTIONS→ filters, search, context (totals detail, row actions)
CONTEXT / ADVANCED    → disclosed on demand (batch fields, tax overrides, notes, history)
```

Visual weight must communicate this order *without the user reading a word*. The app already
does this well on the Sale cart (cart dominates, totals/Save anchored, batch fields hidden until
needed). The redesign work in 8.2+ is to make **every** screen obey the same four-band order.

---

## 4. Navigation Blueprint

### 4.1 Current navigation (evidence)

Built centrally by `initShell()` (`js/ui/layout.js`) from one `PAGE_META` map, producing three
coordinated surfaces:

- **Desktop (≥900px):** fixed left **sidebar** (`renderSidebar`, `css/shared.css:505-523`) listing
  Sale, Items, Purchases, Suppliers, Stock, Manufacturing. Topbar nav-chips exist but are hidden
  on desktop (`css/shared.css:284`, superseded by the sidebar).
- **Mobile (≤899px):** fixed 4-tab **bottom-nav** — Sale, Items, Stock, Menu (`BOTTOM_NAV_ORDER`).
  Off-tab screens (Purchases, Manufacturing, Suppliers) pass `bottomNavActive:'menu'` and live in
  `menu.html`.
- **Back button** per page (`backHref`), label collapses to icon at narrow widths.

This shell is well-built and should be **kept and extended, not replaced.** It is already the
single source of truth for nav — the target IA changes *what it lists*, not *how it works*.

### 4.2 Navigation principles (prescriptive)

1. **Tier-1 actions are always one tap away** from anywhere in the daily loop (bottom-nav on
   mobile, sidebar on desktop).
2. **Administrative destinations never sit on the first level.** Firms, Settings, Company switch,
   and sign-out belong under Menu/Settings — they must not compete with Sale.
3. **Mobile bottom-nav is capped at 4 slots.** More than four thumb targets on a phone bar dilutes
   every one of them. Overflow goes to Menu. (This constraint is already respected; keep it.)
4. **Menu is the structured home of everything non-daily**, grouped by tier (Operations,
   Records/History, Settings) — not a flat list. This directly upgrades `menu.html` (G5).
5. **Back is predictable and consistent** everywhere; it already is — preserve it.

### 4.3 The one open navigation decision — Items vs. Stock on the bottom bar

Today the bottom bar is Sale / **Items** / Stock / Menu. The target proposes Sale / **Home** /
Stock / Menu, moving Items to Tier-2.

- **Why propose the change:** Home fills G3 and gives the daily user a glance + a shortcut back
  into Sale. Items is master-data maintenance (add/edit catalogue), which is a Secondary action,
  not a per-sale one. By the action-tier rule, a Secondary destination should not occupy a scarce
  Tier-1 slot.
- **Why it's flagged, not forced:** if real usage shows shop owners open Items many times a day
  (e.g. frequently correcting prices mid-sale), Items may be genuinely Tier-1 for this audience.
  This is the *only* nav decision that should be validated against real behaviour before 8.2
  commits. Recommended default: **Sale / Home / Stock / Menu**, with Items reachable in one tap
  from Home and Menu. Milestone 8.2 should confirm with the product owner.

### 4.4 Target navigation map

```
Bottom-nav / Sidebar (Tier-1):  [ Sale ]  [ Home ]  [ Stock ]  [ Menu ]

Home ──▶ New Sale (P)  ·  Today's totals (info)  ·  Low-stock jump (S)  ·  Recent sales (S)

Menu
 ├─ Operations       →  New Purchase · New Production
 ├─ Records          →  Sales history · Purchase history · Production history · Customers · Suppliers · Reports
 └─ Settings (A)     →  Company & Firm · GST · Loyalty · Theme · Switch company · Sign out
```

---

## 5. Per-Module Analysis, Workflow Maps & Action Classification

Each module below gives: **Purpose · Information hierarchy · Actions (tiered) · Workflow map ·
Cognitive-load findings · Verdict (screen tier).**

### 5.1 SALE — `sale.html` / `js/sales.js`

**Purpose:** complete a sale at the counter as fast as possible. This is *the* screen.

**Information hierarchy (target):** Cart line items (primary) → running Grand Total + Save
(primary action, anchored) → party + item-search (secondary) → tax/loyalty/payment detail and
batch fields (context/advanced, disclosed).

**Actions:**
- **P:** search-and-add item; set qty; **Save sale**.
- **S:** choose/verify customer; edit rate/discount on a line; set amount received / pay mode.
- **O:** redeem loyalty points; add a brand-new customer inline; pick a batch.
- **A:** none on this screen (correct — the counter screen carries no admin).

**Workflow map (cash sale, one item — the common case):**
```
Entry: app opens here (or Home → New Sale)
  → type item query → tap result           [item added, qty 1, rate prefilled]
  → (batch-tracked? pick batch — extra tap)
  → tap Save sale                           [create_sale RPC, toast invoice #, form resets]
Exit: ready for next sale
≈ 2 taps + one typed query for the minimum sale (party defaults to Cash, amount auto-fills).
```

**Cognitive-load findings (evidence):**
- **CL-1 (systemic): item search clears after every add** (`sale.html:483`), so each additional
  line = re-focus + retype + tap. On a 10-line sale this is the dominant friction. *This is the
  highest-value fix in the whole app.* (Redesign target, not built in 8.1.)
- **CL-2: no scan-to-add.** No camera/scanner exists anywhere (`js/ui/barcode.js` only *generates*
  a code). A counter with barcoded stock must type. (See §6 and §12 for the disciplined take.)
- **CL-3: no quantity entry from the search row** — every add lands qty 1, then the user edits the
  line. For "5 of these" this is two interactions instead of one.
- **CL-4: Save writes immediately with no confirmation** and the invoice then vanishes (ties to
  G1). Fast is good; *irreversible + invisible* is the risk.

**Verdict:** **② Existing — needs UX redesign** (workflow is right, the repeated-search loop and
the missing history/undo are the problems).

### 5.2 PURCHASE — `purchase.html` / `js/purchases.js`

**Purpose:** record stock coming in from a supplier. Occasional (done when goods arrive), not a
counter action.

**Information hierarchy:** line items → totals + Save → supplier + bill number/date → batch
sub-fields + payment reference (disclosed).

**Actions:**
- **P (within this task):** add item line; **Save purchase**.
- **S:** choose supplier; enter qty/rate; enter batch details (batch no/shade/size/MRP) for
  batch-tracked lines (`purchase.html:567`).
- **O:** add/edit a supplier inline (the inline pencil, `partyRow.js:22` — the one row-level edit
  affordance in the transactional screens); set payment reference (`purchase.html:605`).
- **A:** none.

**Workflow map:** same shape as Sale (supplier defaults to Walk-in; add lines; Save →
`create_purchase`). Duplicate bill-number handled with a friendly message (Postgres `23505`).

**Cognitive-load findings:**
- Inherits **CL-1** (search clears after each add) and **CL-3** (qty-in-search) from Sale.
- **CL-5: batch lines require up to 4 extra typed sub-fields per line** (batch/shade/size/MRP).
  Necessary data, but heavy on a multi-line bill; progressive disclosure + smart defaults (copy
  last lot) should soften it (the dialog already copies a previous lot as a template — extend
  that thinking).
- **CL-6: bill date is duplicated** between a topbar chip and a side field kept in sync
  (`purchase.html:299`) — two controls for one value is avoidable cognitive overhead.

**Verdict:** **② Existing — needs UX redesign** (Occasional task correctly de-prioritised in nav;
line-entry friction and the duplicated date control are the fixes). Add **③ Purchase history**.

### 5.3 MANUFACTURING — `manufacturing.html` / `js/manufacturing.js`

**Purpose:** produce finished items from raw materials (BOM). Occasional.

**Information hierarchy:** three stacked panels — Produce (what/how many) → Materials consumed →
Cost summary (live `previewMfgCost`, `manufacturing.js:10`) → Save.

**Actions:**
- **P (within task):** choose produced item + qty; add material lines; **Save production run**
  (enabled only when produced item + qty>0 + ≥1 material, `manufacturing.html:482`).
- **S:** set material qty/unit cost; overhead cost.
- **O:** pick a batch to consume from (unit cost then locks to batch cost, `manufacturing.html:455`);
  batch details for a batch-tracked produced item; notes.
- **A:** none.

**Workflow map:** reveal produced-item search (card→search→result) → set qty → add each material
(search→result→qty/cost) → review cost/unit → Save → `create_manufacturing`.

**Cognitive-load findings:**
- **CL-7: two independent search-and-add flows on one screen** (`#produced-search` and
  `#item-search`), *both* clear after use — the CL-1 problem, doubled.
- **CL-8: extra tap to reveal the produced-item search** (card acts as a gate before the search).
- **CL-9: single-column, three tall panels** → most vertical scrolling of any screen on mobile;
  no mini-totals anchor (unlike Sale/Purchase), so the live cost summary can be off-screen while
  entering materials.

**Verdict:** **② Existing — needs UX redesign.** Add **③ Production history**.

### 5.4 STOCK — `stock.html` / `js/items.js`

**Purpose:** answer "do I have it, and how much?" and correct stock. The only browsable
transactional data today; a Secondary daily action (quick lookups between sales).

**Information hierarchy:** search + filter pills (All / Low / With batches, `stock.html:214`) →
item rows with colour-coded qty chip and low-stock badges (`renderItemRow`, `stock.html:223`) →
drill → batch list with per-row **Adjust** and **History** (`stock.html:279,308`).

**Actions:**
- **P/S:** search an item; read the stock number (the core daily use).
- **O:** adjust stock (+/−, required reason select, live new-qty preview) — the module's only true
  edit; view history (read-only ledger).
- **A:** none.

**Workflow map (lookup):** search/filter → read qty. **(Adjust):** row → Adjust → type qty → pick
reason → Save (`recordStockAdjustment`) ≈ 3 taps + typing + a select. Reasonable.

**Cognitive-load findings:**
- **CL-10: find-only by search/filter** — no sort, no category grouping. Fine at small catalogues;
  a scaling risk. Low-stock is a filter, not a surfaced signal (ties to Home/G3: low-stock should
  *come to* the owner, not require a filter tap).

**Verdict:** **① Existing** (structurally sound; benefits from Home surfacing low-stock, and from
consistent list patterns in 8.2).

### 5.5 ITEMS — `items.html` / `js/items.js`

**Purpose:** manage the catalogue. Secondary/Administrative — set up once, edited occasionally.

**Information hierarchy:** search + filter pills (Active / All) → item rows (name, badges,
code·unit·GST·HSN, stock chip, price) → kebab (Edit / Deactivate / Delete) → modal item form
(`#dlg-item`, `renderItemFormFields` `items.html:156-180`), grouped Basics/Tax/Pricing/Stock with
progressive disclosure (Service hides the Stock group).

**Actions:**
- **P (of this screen):** Add item; Edit item.
- **S:** search/filter; generate barcode code (⚡).
- **O:** Deactivate/Reactivate.
- **A:** Delete (hard delete, only if never used — else suggests Deactivate). Correctly rare.

**Cognitive-load findings:**
- **CL-11:** the item form is the app's densest form (Basics/Tax/Pricing/Stock). Its grouping +
  disclosure already manage this well; the only requirement is that 8.2 preserve the
  required-vs-optional discipline (only *Item name* is required) and not surface tax/stock detail
  until relevant.

**Verdict:** **① Existing** (sound; keep the progressive-disclosure form model as a reference
pattern for the whole app).

### 5.6 SUPPLIERS — `suppliers.html` / `js/suppliers.js`

**Purpose:** manage suppliers and see balances owed. Occasional.

**Information hierarchy:** search + filter (Active/All) + **Sort (Name / Balance)** — the only sort
control in the app → rows (name, badge, phone·GSTIN·state, payable/advance chip) → tap opens a
**details dialog** (`#dlg-details`, stats via `getSupplierPurchaseStats`) → Edit/Archive.

**Actions:** **S:** search/sort; **O:** Add/Edit/Archive supplier; view details. **A:** none.

**Cognitive-load findings:** none significant — this is the app's most complete management screen
and is the **reference template** for the Planned Customers screen (§5.8).

**Verdict:** **① Existing** (use as the pattern donor for Customers).

### 5.7 DASHBOARD / HOME — *does not exist* → **③ Planned**

**Problem it solves (G3):** after choosing a company the user lands directly in the Sale form.
There is no surface that answers "how is my shop doing right now?" and no glanceable entry to the
day. Low-stock is buried behind a filter; today's takings are unknowable without a Reports screen
that also doesn't exist.

**Why it belongs (five-condition test):** it *reduces cognitive load* (the day's state at a
glance instead of reconstructing it), *reduces taps* (New Sale + jump-to-low-stock from one
place), *improves discoverability* (surfaces history/customers/reports that are otherwise hidden),
*preserves simplicity* (read-mostly, one Primary button), and is *mobile-first* (a short scroll of
cards). It is the natural home for the Tier-1 signals the counter user needs between sales.

**Content (minimum, evidence-driven — not a generic analytics board):** a prominent **New Sale**
button (P); **today's sales total + count**; a **low-stock shortlist** (reuses the existing
low-stock logic from Stock); **recent sales** (needs G1). Nothing that requires new backend
capability beyond reading existing data. Deliberately *not* a chart-heavy analytics dashboard
(§12 R2).

**Verdict:** **③ Planned**, Tier-1.

### 5.8 CUSTOMERS — *no management screen* → **③ Planned**

**Problem it solves (G2):** customers can only be created/selected inside a sale
(`#dlg-party`/`#dlg-new-party`, `sale.html`; `js/sales.js:40,44`). There is no way to see who owes
money, review a customer's purchase history, or fix a customer's phone/GSTIN outside of billing.
Suppliers have exactly this screen; customers — who are more numerous and carry credit balances —
do not. This asymmetry is a real gap, not a symmetry-for-its-own-sake request.

**Why it belongs (five-condition test):** *cognitive load ↓* (see all receivables in one place
instead of inferring), *taps/time ↓* (edit a customer without starting a fake sale), *discoverability
↑* (dues become visible), *simplicity kept* (it mirrors an existing, proven screen), *mobile-first*
(same list pattern). The party data model already supports it (`parties` with `is_customer`), so
no backend change.

**Design directive:** build it as a **near-mirror of `suppliers.html`** — list with balance chips
(Due/Advance), search, sort by balance, details dialog with history, Edit/Archive. Reuse
`createListRow`, `partyRow.js`, the Form Framework, and the party search. This is the cheapest,
most consistent way to close G2.

**Verdict:** **③ Planned**, Tier-2.

### 5.9 TRANSACTION HISTORY (Sales / Purchase / Production) — *none exist* → **③ Planned**

**Problem it solves (G1):** the three create-only screens never let you see what you created. A
shop owner cannot review the day's sales, reopen/reprint a bill, or correct an error. Save is
immediate and the record then vanishes (`sales.js:125`; form reset). This is the biggest workflow
gap in the product.

**Why it belongs (five-condition test):** *cognitive load ↓* (no need to remember or reconstruct
what was sold), *taps/time ↓* (reprint/duplicate instead of re-entering), *discoverability ↑* (the
work you did is findable), *simplicity kept* (a list + detail view, the app's most common pattern),
*mobile-first* (scrollable list, same as Stock/Items). It also gives Save a safety net (G1/CL-4):
a mistake becomes correctable rather than permanent-and-invisible.

**Design directive:** one consistent **list → detail** pattern reused for all three transaction
types (Sales history, Purchase history, Production history), each reachable from Menu → Records
(and Sales history also from Home). Detail view is read-first, with reprint/duplicate; edit/void
follows whatever the backend already permits (no new business logic in 8.1).

**Verdict:** **③ Planned**, Tier-2 (Sales) / Tier-3 (Purchase, Production).

### 5.10 SETTINGS — *scattered* → **③ Planned**

**Problem it solves (G4):** company/firm/GST config lives only in the create-company dialog
(`index.html`); firm switching is a topbar chip; theme is a per-page toggle. There is no single
place to change "how my shop bills." `menu.html:72` already promises it.

**Why it belongs (five-condition test):** *cognitive load ↓* (one predictable place for rare
config), *taps/time ↓* (no hunting across screens), *discoverability ↑* (firm/GST/loyalty/theme
become findable), *simplicity kept* (Administrative tier, off the daily path), *mobile-first* (a
simple settings list). Purely a *reorganisation* of existing capabilities — no new backend.

**Design directive:** Menu → **Settings** grouping: Company & Firm, GST, Loyalty, Theme, Switch
company, Sign out. This absorbs the topbar firm-chip and the scattered theme toggle into one
Administrative home.

**Verdict:** **③ Planned**, Tier-4 (Administrative).

### 5.11 AUTHENTICATION & COMPANY PICKER — `index.html` / `js/supabaseClient.js`

**Purpose:** sign in and choose a company/firm to operate. Rare (Administrative).

**Information hierarchy:** sign-in gate (email/password, `#gate`) → company list (cards with role +
last-sale) → open company → `sale.html`.

**Actions:** **A:** sign in/out; create/rename/delete company (delete requires typing the name);
switch company. All correctly rare and off the daily path.

**Cognitive-load findings:**
- **CL-12: no self-serve signup** (`signUp()` exists but is uncalled; accounts provisioned
  externally). This is a *product decision*, not an oversight — fine to keep for a
  counter-operator tool, but it must be an explicit choice going forward (see §12 R5).
- The sign-in gate is intentionally hand-built (documented exception in `index.html`), not a Form
  Framework form — acceptable; leave as-is.

**Verdict:** **① Existing** (sound; Firm switching should relocate into Settings per §5.10).

---

## 6. Search Strategy

**Current behaviour (evidence):** one engine, `createSearchService()` (`js/searchService.js`),
company-scoped, `ilike` across configured columns, capped by limit. Three contextual instances —
items (`sales.js:12`, cols name/code), parties/customers (`sales.js:34`), suppliers
(`suppliers.js:14`). List pages run their own paginated `.or(ilike)` queries. Everything is
debounced (`js/ui/debounce.js`; 220ms lists, 200ms pickers). **No global search. No barcode/QR
scanner** (only code *generation* in `barcode.js`). **No recent/history/autocomplete persistence.**
No-match offers "+ Create '&lt;term&gt;' now" (`sale.html:455`).

**Target strategy (prescriptive, evidence-led):**

1. **Keep search contextual, not global.** A counter user searches *within a task* ("find this
   item to add to the sale"), not across the whole app. A global omni-search would add a surface
   without removing friction from any real workflow — it fails the five-condition test.
   **→ ④ Rejected** (global search); **① keep** contextual pickers.

2. **Fix the repeated-search loop (CL-1) as the #1 search priority.** The single change that most
   improves counter speed is *not clearing / instantly re-focusing the item search after an add*,
   so the next item can be typed immediately. This is a behaviour the Search Service's callers own
   (the pickers), not the engine. **→ ② Redesign**, highest priority in 8.2.

3. **Quantity-aware add (CL-3).** Allow qty entry at add time (e.g. accept "5 &lt;item&gt;" or a qty on
   the result row) so "5 of these" is one interaction. Justified: reduces taps on the most common
   multi-unit sale. **→ ② Redesign.**

4. **Barcode scanning — Planned but *disciplined*.** Camera scan-to-add would genuinely reduce
   typing at a barcoded counter (passes the test *for shops that use barcodes*). But it is not a
   given: many small shops don't barcode. **→ ③ Planned as an *optional* accelerator**, never the
   primary path; typing must always remain first-class. Do not let scanning complicate the default
   flow. (Prereq: the `code` column already participates in search, so a scan just feeds the
   existing query — no engine change.)

5. **Recent items — Planned, small.** Surfacing a few recently-sold items when the search box is
   empty reduces typing for the shop's fast-movers. Passes the test (taps ↓, cognitive load ↓,
   simple). **→ ③ Planned**, low cost. Full search *history* persistence is **④ Rejected** — it
   adds storage/UI for little counter value.

---

## 7. Form Strategy

**Current behaviour (evidence):** field-and-validation-level Form Framework (`js/ui/forms/`,
barrel `index.js`). Field factories return `{html, mount}`; `renderFieldsInto()` fills static grid
containers; validation via `watchFieldValidation`/`validateField` (light in practice — usually just
`required` on name). Forms are **native `<dialog>` modals** with hand-written dialog chrome per
page; autofocus is explicit after `showModal()`. Reused across Items, Suppliers, Quick-add-item,
and the index company dialogs. Documented exceptions (sign-in gate, Goods/Service toggle) are
hand-built.

**Target strategy (prescriptive):**

1. **Keep the framework; it is production-ready and out of scope to rearchitect.** The blueprint's
   job is to define *form behaviour rules* every screen follows, not to change the framework.

2. **Required-vs-optional discipline is a product rule, not a per-form whim.** Evidence shows the
   right instinct already: only *Item name*, *Supplier name*, *Customer name* are required;
   everything else is optional/coerced. **Rule:** a form asks for the *minimum* to complete the
   task; everything else is Optional and disclosed. This is what keeps the counter fast.

3. **Smart defaults everywhere** (already partly present): party defaults to Cash/Walk-in; rate
   prefills from the item's default price; amount received auto-fills to grand total; state code
   defaults to the firm's; batch dialog copies the last lot. **Rule:** every field that *can* have
   a sensible default *must* have one, so the common path is "accept defaults + Save."

4. **Progressive disclosure is mandatory** (already present for batch fields, Service items,
   payment references). **Rule:** advanced fields (tax overrides, batch detail, references, notes)
   never appear until relevant.

5. **Autofocus the one field that starts the task** — already the pattern (`.focus()` on the
   primary field after `showModal()`). Keep it universal.

6. **Consistency of chrome.** Every form: title, fields, then a fixed action row with
   Cancel (ghost) + primary Save, Save on the right. This is the current convention; 8.2 should
   make it exception-free.

**Do not** introduce a whole-form/dialog-builder abstraction in this milestone — that's an
implementation choice for later; the blueprint only fixes the *behavioural* rules above.

---

## 8. Screen Architecture (universal layout contract)

Every ApnaBill screen — existing or planned — must be composable from one skeleton, so the app
feels like one product:

```
┌ TOPBAR ───────────────────────────────────────────────┐
│  Back · Brand/Company · (context chips) · Theme        │   ← consistent, shell-built
├ PRIMARY REGION ───────────────────────────────────────┤
│  The content the user came for (cart / list / panels)  │   ← dominates the screen
├ PRIMARY ACTION ───────────────────────────────────────┤
│  One obvious action, anchored (Save / Add / New Sale)  │   ← never scrolls out of reach
├ SECONDARY ────────────────────────────────────────────┤
│  Search · filters · row actions                        │
├ CONTEXT / ADVANCED (disclosed) ───────────────────────┤
│  Batch fields · tax overrides · notes · history        │
└ NAV (Tier-1) ─────────────────────────────────────────┘   ← bottom-nav (mobile) / sidebar (desktop)
```

**Rules:**
- The **Primary action is always reachable without scrolling** (mobile: sticky bar, as Sale/Purchase
  already do with `#mini-totals`; Manufacturing currently lacks this — a redesign item, CL-9).
- **One Primary action per screen.** If a screen seems to need two, one of them is Secondary.
- **Administrative controls never live in the Primary or Secondary bands** of a daily screen.
- List screens share one row pattern (`createListRow`/`dataTable.js`); transactional screens share
  the cart pattern; management screens share the list+details+form pattern (Suppliers is the model).

This contract is what lets 8.2–8.6 build new screens (Home, Customers, histories) that feel native
on day one.

---

## 9. Mobile-First Strategy

The phone is the product. Confirmed commitments already in the app to preserve and extend:

- Fixed 4-tab bottom-nav; sticky mini-totals with a "Details ↑" expander on Sale/Purchase
  (`sale.html:113,338`); single-column stacking; `env(safe-area-inset-*)` for notched phones;
  breakpoint at 900px; back-label collapse to icon at narrow widths.

**Directives for 8.2+:**
1. **Thumb reach:** Primary actions anchored to the bottom third; large touch targets; no critical
   control in a top corner on a daily screen.
2. **Minimise typing:** defaults + recent items + (optional) scan; the repeated-search fix (CL-1)
   is the flagship mobile improvement.
3. **Minimise scrolling on entry screens:** give Manufacturing a sticky cost/Save anchor (CL-9);
   keep disclosed sections collapsed by default.
4. **One-hand operation is the test:** if a common flow can't be completed with a thumb on a
   6-inch phone while holding it, it's wrong.
5. **Calm feedback:** live totals/previews (already present) over modal confirmations; toasts for
   results.

---

## 10. Desktop Enhancement Strategy

Desktop is an amplifier of the *same* product — more information and keyboard speed, never more
complexity or a different workflow.

- **Same workflows, wider canvas:** the two-column cart (list + persistent totals/payment aside)
  is exactly right — desktop shows the totals the mobile user has to expand. Extend this "reveal
  more, change nothing" principle to Home (more cards visible), histories (more columns), and
  management screens (details inline beside the list rather than in a dialog).
- **Persistent sidebar** stays the desktop nav (already `renderSidebar`); it can list Tier-1 + a
  grouped Tier-2/3, since desktop has the room the 4-slot phone bar does not.
- **Keyboard speed (Planned, O):** on the Sale screen, keyboard-driven add (type → Enter to add →
  keep typing) is the desktop analogue of the CL-1 fix and pairs with it. Justified: reduces
  time for a desk-based operator without touching the mobile flow.
- **Never** desktop-first: no dense tables, hover-only actions, or multi-panel layouts that can't
  degrade to the phone. If a desktop idea has no mobile form, it doesn't ship.

---

## 11. Cognitive-Load Audit (consolidated)

| ID | Screen | Type | Finding | Target |
|---|---|---|---|---|
| CL-1 | Sale/Purchase/Mfg | Typing/Repetition | Item search clears after every add → retype per line | ② #1 fix |
| CL-2 | Sale | Typing | No scan-to-add (barcoded stock must be typed) | ③ optional |
| CL-3 | Sale/Purchase | Taps | No qty at add time → line added qty 1, then edited | ② |
| CL-4 | Sale | Memory/Safety | Save is immediate + invoice then invisible (no history/undo) | ③ history |
| CL-5 | Purchase | Typing | Up to 4 batch sub-fields per line | ② disclosure/defaults |
| CL-6 | Purchase | Decision | Bill date duplicated in two controls | ② unify |
| CL-7 | Manufacturing | Repetition | Two search boxes, both clear after use | ② |
| CL-8 | Manufacturing | Taps | Extra tap to reveal produced-item search | ② |
| CL-9 | Manufacturing | Scrolling | No sticky cost/Save anchor; long scroll | ② |
| CL-10 | Stock | Discoverability | Find-only (no sort/grouping); low-stock hidden behind filter | Home surfaces it |
| CL-11 | Items | Info density | Densest form (managed well; keep disclosure) | keep |
| CL-12 | Auth | Product | No self-serve signup (intentional; make explicit) | decision §12 |

**Themes:** the dominant cost is **typing/repetition on line entry (CL-1/3/5/7)** — fixing the
search-add loop is worth more than any new screen. The second theme is **invisibility of completed
work (CL-4/G1)** — history closes it. The third is **scattered configuration (G4)** — Settings
closes it.

---

## 12. Explicitly Rejected (do NOT add)

Each of these is a plausible "ERP/POS" feature that **fails the five-condition test for
ApnaBill's counter-first purpose.** Documented so later milestones don't re-litigate them.

- **R1 — Global omni-search.** Search is task-contextual; a global search adds a surface without
  removing friction from any real workflow. *Fails: taps/simplicity.* Keep contextual pickers.
- **R2 — Analytics-heavy dashboard (charts, KPIs, trends).** The counter user needs *today's
  number + what's low + a New Sale button*, not a BI board. A chart wall raises cognitive load and
  serves an audience (analyst) ApnaBill doesn't target. *Fails: cognitive load/simplicity.* Home
  is deliberately minimal (§5.7). Deeper reporting stays a lean, on-demand **Reports** screen (O),
  not a homepage.
- **R3 — Multi-step wizard checkout / mandatory confirmation dialog on Save.** Adding a confirm
  step to every sale slows the most frequent action for the rare mistake. *Fails: taps/speed.* The
  right safety net is *history + editable/void records* (G1), not a per-sale speed bump.
- **R4 — SPA / client-side router rewrite.** The MPA + `initShell()` shell already delivers fast,
  consistent nav; a framework rewrite is churn with no user-facing workflow win, and risks the
  frozen backend contract. *Fails: simplicity/scope.* Keep the MPA.
- **R5 — Self-serve public signup (for now).** ApnaBill provisions operator accounts externally
  (`signUp()` uncalled). For a counter tool this is a legitimate stance; adding public signup is a
  business/security decision, not a UX gap. *Deferred by decision*, flagged for the product owner —
  not silently assumed.
- **R6 — Search history persistence / full recent-searches.** Storing and surfacing prior *queries*
  costs UI and storage for little counter value; **recent *items*** (R-accepted, §6.5) delivers the
  real benefit at lower cost.
- **R7 — Per-page bespoke navigation or a 5th+ bottom-nav tab.** More than four thumb targets
  dilutes each. *Fails: mobile-first/simplicity.* Overflow lives in Menu.

---

## 13. Future Design-System Requirements (for Milestone 8.2)

8.1 defines behaviour; 8.2 will define the visual/interaction system. To stay coherent, the design
system must supply — at minimum — these tokens/components/patterns, all already implied by the
current app so nothing here invents a new product surface:

- **Action-tier styling tokens:** a visual language that makes Primary/Secondary/Occasional/
  Administrative legible at a glance (weight, size, placement) — the visual expression of §2's
  tiers.
- **The four-band screen skeleton (§8)** as a reusable layout, so Home/Customers/histories are
  composed, not hand-built.
- **One list-row component contract** (extends `createListRow`/`dataTable.js`): title, badges,
  meta line, value chip(s), row actions — used by Items, Stock, Suppliers, and Planned Customers/
  histories identically.
- **One "record detail" pattern** (Suppliers `#dlg-details` is the seed): info + business stats +
  actions, for Customers/Suppliers/transaction details.
- **The transactional "cart" pattern** (Sale/Purchase) formalised: line list + disclosed line
  fields + anchored totals/Save + mobile mini-bar (and give Manufacturing the same anchor).
- **Form behaviour rules from §7** encoded as defaults: required-minimum, smart defaults,
  progressive disclosure, autofocus, consistent Cancel/Save chrome.
- **Search-input + results-dropdown pattern** with the CL-1 fix baked in (no-clear/instant-refocus,
  qty-aware add, recent items, optional scan hook).
- **Status/feedback vocabulary:** toast semantics (ok/warn), colour-coded value chips (low/severe
  stock, payable/advance) — standardise the already-present colour meanings.
- **Theme + safe-area + breakpoint tokens** (900px, `env(safe-area-inset-*)`, dark mode) promoted
  to first-class system tokens (already in `css/shared.css`; formalise).

The design system must be **mobile-first and expand to desktop by revealing more**, matching §9–§10.

---

## 14. Recommendations for Milestone 8.2 (sequenced by value)

Ordered by counter-impact, so 8.2 starts where the user feels it most:

1. **Fix the line-entry loop (CL-1/3/7).** Search-add without clearing + qty-aware add on Sale,
   Purchase, Manufacturing. *Highest daily-speed win; touches only picker behaviour, not the
   engine.*
2. **Ship Home (§5.7).** New Sale + today's total + low-stock + recent sales. *Gives the app a
   spine and surfaces hidden signals; read-only on existing data.*
3. **Ship Sales history (§5.9).** Closes G1/CL-4; makes Save safe. *Highest-value new screen.*
4. **Ship Customers management (§5.8)** as a mirror of Suppliers. Closes G2.
5. **Consolidate Settings + Menu grouping (§5.10, §4.4).** Closes G4/G5; moves Firm-switch and
   theme off the daily path.
6. **Manufacturing anchor + single search discipline (CL-7/8/9)** and **Purchase date unify
   (CL-6).**
7. **Then** Purchase/Production history, Reports (lean), and the optional scan/recent-items
   accelerators.

Establish the design system (§13) in parallel with items 1–2 so every subsequent screen inherits it.

---

## 15. Milestone completeness check

- [x] No screen redesigned, no code written, no CSS/HTML/schema/RPC/business-logic changed.
- [x] No workflow altered; only documented and given a target.
- [x] Every module classified (① / ② / ③) with purpose, hierarchy, tiered actions, workflow,
      and cognitive-load findings.
- [x] Every Planned addition passes the five-condition test with a stated ApnaBill problem;
      everything that fails is in §12 with reasons.
- [x] Actions classified P/S/O/A throughout; classification drives nav priority (§2, §4).
- [x] Prescriptive target IA + Navigation Blueprint defined for V2.0 (8.2–8.6).
- [x] Detailed enough that another senior engineer can execute 8.2+ without independent product
      decisions (the one open item — Items vs. Home in the bottom bar, §4.3 — is explicitly
      flagged for validation rather than left ambiguous).

*End of blueprint.*
