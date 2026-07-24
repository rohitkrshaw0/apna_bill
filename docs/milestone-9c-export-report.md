# Milestone 9C — Tally XML Export Engine: Export Report

Deliverables document for the ApnaBill → Tally XML export engine, the reverse direction
of Milestone 9B's XML import engine, built on Milestone 9A's Data Exchange Platform.
Covers the spec's required items: the export engine, the XML writer, the validation
layer, this report, the round-trip compatibility results, automated test results, and
remaining work for 9D (Backup & Restore) — **not started, per instruction.**

## 1. What was built

`js/services/dataExchange/xml/export/` — a new, self-contained subtree:

```
export/
  dataReaders.js                    NEW reads: items, parties, opening stock, sales+lines
  mapping/
    masters/companyExportMapper.js   active firm -> companyDTO
    masters/itemExportMapper.js       item row -> itemDTO (+opening-stock siblings)
    masters/partyExportMapper.js       party row -> customerDTO/supplierDTO (+opening balance)
    vouchers/salesVoucherExportMapper.js  invoice+lines -> saleDTO (totals transcribed)
  validators/xmlExportRules.js        4 rules reused directly from 9B + 1 new export-only rule
  tallyXmlWriter.js                    generic tree -> XML text serializer
  tallyXmlFormatterV1.js                owns every Tally-specific structural decision
  xmlExporter.js                         buildXmlExportPlan() / createXmlExporter() /
                                          runXmlExport() -- read -> DTO -> validate -> format
  download.js                             browser Blob+anchor download trigger

xml/xmlExport.test.html                  offline test harness (65 checks, incl. round-trip)
docs/milestone-9c-export-report.md       this document
```

Two, and only two, existing files were touched, both purely additive (confirmed by
`git diff --stat`: 0 deletions of behavior, only insertions):
- **`xml/mapping/stateCodes.js`**: added `codeToStateName(code)`, the inverse of 9B's
  existing `stateNameToCode(name)`, built from the same 37-entry table already in the
  file — avoids duplicating the GST state-code list in a new file. `stateNameToCode`'s
  existing behavior is byte-identical before and after (verified directly).
- **`xml/index.js`**: extended the existing barrel with the new export-side public API,
  the same pattern already used for every other subfolder in that file.

No file in `js/items.js`, `js/sales.js`, `js/suppliers.js`, `js/supabaseClient.js`, any
`*.html` screen, `schema.sql`, or any `*_rpc.sql` file was touched.

## 2. Architecture

```
Database -> Exporter -> DTO -> Formatter -> Writer -> Output
```

- **Reads** (`dataReaders.js`): new, unpaginated/internally-looped queries for items,
  parties, and sales+lines (confirmed by research: no existing function in the codebase
  lists any of these unpaginated — the only pre-existing `invoices` read anywhere,
  `lastCompanyActivity()`, selects only `created_at`). Reuses `listBatchesForItem`
  (`items.js`) for batch reads rather than re-querying `batches` directly.
- **Mappers** (`export/mapping/**`) stay strictly ERP-agnostic: DB row → 9A's existing
  DTO (`itemDTO`/`customerDTO`/`supplierDTO`/`saleDTO`/`companyDTO`) plus only the
  minimal neutral siblings a DTO has no field for (opening stock, opening balance). No
  mapper contains a single Tally tag name.
- **Formatter** (`tallyXmlFormatterV1.js`) owns *every* Tally-specific structural
  decision: the `ENVELOPE`/`HEADER`/`BODY`/`IMPORTDATA`/`REQUESTDESC`/`REQUESTDATA`
  envelope, `TALLYMESSAGE` ordering, the `.LIST` suffix convention, GST-rate splitting,
  enum-string encoding (`"Yes"`/`"No"`, `"Applicable"`/`"Not Applicable"`), the
  `PARENT = "Sundry Debtors"/"Sundry Creditors"` and `PARTYLEDGERNAME = "Cash Sale"`
  literals, and the `GROUP`/`UNIT`/`CURRENCY` structural scaffolding that isn't backed
  by any DTO at all. This is deliberately swappable: a future Tally revision or a
  different ERP dialect is a *new* formatter implementing the same `IFormatter`
  contract, never an edit to this file (see §10).
- **Writer** (`tallyXmlWriter.js`) is a pure, generic tree → XML text serializer. It has
  no knowledge of items, customers, sales, or Tally itself — only how to escape,
  indent, and self-close correctly.
- **Exporter** (`createXmlExporter()`, `xmlExporter.js`) implements 9A's
  `exporters/contract.js` `IExporter` (`prepare`/`export`/`finalize`) and, per that
  contract's own header comment ("Turning a DTO into an output string/file is a
  Formatter's job, not this contract's"), produces DTOs only — it never calls the
  formatter itself. `runXmlExport()` is the orchestration layer that wires
  Exporter → Formatter → Output together, exactly matching the diagram above.

`xmlImporter.js`/`items.js`/`sales.js`/`suppliers.js`/`supabaseClient.js` are all
imported **dynamically** (not at module top level) inside `dataReaders.js`/
`xmlExporter.js`, mirroring 9B's own fix for the same issue: none of them pulls in the
Supabase SDK's remote CDN import merely by being *loaded* — only actually calling a
function that reads the database does. This is what keeps `xmlExport.test.html` (and
the `xml/index.js` barrel it imports) genuinely offline.

## 3. Supported XML coverage

Master file (mirrors 9B's import coverage exactly):

| Entity | Exported? | Notes |
|---|---|---|
| `COMPANY` | Yes | From the active **firm** (not `companies` — no `state_code`/`gstin` column there), confirmation-only shape, matching 9B's decision 1 |
| `STOCKITEM` | Yes | Every active item |
| `LEDGER` (customer) | Yes | `PARENT = "Sundry Debtors"` |
| `LEDGER` (supplier) | Yes | `PARENT = "Sundry Creditors"` |
| Opening balance | Yes | `parties.opening_balance`, the genuine stored value |
| Opening stock | Conditional | Only where a real `stock_ledger` `txn_type='opening'` row exists — see §6 |
| `GROUP`, `UNIT`, `CURRENCY` | Yes | Formatter-only structural scaffolding, not backed by any DTO |

Voucher file:

| `VCHTYPE` | Exported? |
|---|---|
| `Sales` | Yes |
| Purchase / Manufacturing / Payment / Receipt / Journal | **No** |

## 4. Unsupported XML — intentional, matching 9B's import scope exactly

Per the spec's explicit instruction, only structures already validated through 9B are
exported. Purchase, Manufacturing, Payment, Receipt, and Journal vouchers are **not**
exported — 9B's importer never built a handler for any of them (the supplied sample data
contained only Sales vouchers), so there is nothing on the import side for an exported
file of that shape to round-trip against. Building export logic for voucher types the
importer can't consume would mean inventing structure with no validated counterpart —
exactly what the spec forbids. JSON Backup, Restore, CSV, Excel, ZIP, and Migration were
also explicitly out of scope and none were touched.

## 5. Where an export mapping is not a byte-for-byte inverse of import (documented)

- **`itemExportMapper.js`** doesn't split GST at all — that's the formatter's job (§2).
  The mapper only carries `gstRate` (already summed, matching `itemDTO`'s existing
  shape) plus a `meta.centralTax/stateTax/integratedTax` breakdown, populated *solely*
  so the reused `gstRateCrossCheckRule` can validate before formatting — a numeric
  consistency value, not a structural decision, so it stays a thin mapper concern.
- **`partyExportMapper.js`** never resolves a group-classification chain (9B's
  `groupClassifier` exists to *derive* customer-vs-supplier from a `PARENT` string on
  import); export already knows the role directly from `is_customer`/`is_supplier`, so
  there's one fewer step, not a different mapping.
- **`salesVoucherExportMapper.js`** transcribes `invoices`' already-committed
  `cgst_total`/`sgst_total`/`igst_total`/`discount_total`/`round_off`/`grand_total`
  straight onto `saleDTO.totals`, rather than recomputing via `buildInvoiceMath()` a
  second time — that math already ran once, at sale time. The DTO's `payment` field
  stays `null` on export: `payments` has a one-to-many relationship to an invoice
  (partial payments over time), so there is no single "the" payment to place there
  without inventing a lossy simplification; `amountPaid`/`amountDue` (already a clean
  per-invoice aggregate) travel in `meta` instead.

## 6. Known limitations (flagged, not silently worked around)

- **Opening stock is not reconstructable for purchase-sourced batches.** There is no
  `opening_qty` column on `batches` — only a genuine `stock_ledger` row with
  `txn_type='opening'` (written exclusively by 9B's `record_opening_stock` RPC) proves
  what a batch's true starting quantity was. A batch created via an ordinary purchase
  (`txn_type='purchase'`) never had such a row and never will. **Export never
  reinterprets `qty_on_hand` (today's live balance) as "opening"** — that would be
  factually wrong for any batch with real transaction history. Where no genuine opening
  row exists, the `OPENINGBALANCE` tag is omitted entirely for that item/batch, never
  fabricated as `0`. Concretely: exporting a company immediately after a 9B import
  round-trips opening stock correctly (that RPC always wrote a real opening row); a
  company whose stock was built up through ordinary purchases over time will export
  those items *without* an opening-stock figure, which is the schema's actual limit, not
  an export defect.
- **Round Off is recomputed, not transcribed, on the way back through 9B's importer.**
  On export, `Round Off (Sales)` is written from the invoice's own stored `round_off`
  value (transcribed, per §5). But 9B's importer doesn't read that ledger entry back as
  authoritative — `saveSaleFromCart()` recomputes round-off itself via
  `buildInvoiceMath()` from rate/qty/GST. Same underlying math both ways, so in practice
  these agree, but a ±₹0.01 divergence is possible in rare cases, the same nuance 9B's
  own report already documented in the opposite direction.
- **A fully empty Sales-voucher export (zero invoices) cannot itself be re-imported by
  9B.** `tallyXmlParser.validate()` requires at least one `TALLYMESSAGE` (matching every
  real Tally export ever inspected) and correctly rejects a file with none — confirmed
  directly in `xmlExport.test.html`. This only affects the voucher file: the master file
  always contains the `CURRENCY`/`GROUP` scaffolding even with zero items/parties, so it
  never hits this case. Exporting zero sales still succeeds and produces syntactically
  well-formed XML; it just isn't a meaningful re-import target, which is expected rather
  than a defect.
- **A party flagged as both `is_customer` and `is_supplier`** (schema allows it; no
  existing write path in the app ever sets both) exports as **two** `LEDGER` records, one
  under each group, so no data is silently dropped for that edge case.

## 7. Validation rules

Reused directly from `xml/validators/xmlBusinessRules.js` (9B), unmodified: `requiredFieldsRule`,
`dateFormatRule`, `gstRateCrossCheckRule`, `referencedEntitiesRule`. `quantitySplitRule`
is deliberately **not** reused — it checks a text-parse-failure flag that only has
meaning when the source was XML text; export reads already-typed DB numerics.

One new rule, `duplicateNameWithinBatchRule` (`export/validators/xmlExportRules.js`),
justified as genuinely export-only: `items.name`/`parties.name` carry no unique
constraint in `schema.sql` (only `items.code` does), but Tally's `STOCKITEM`/`LEDGER`
`NAME` is effectively an identity key — two ApnaBill records validly sharing a name
would silently collide in the exported file. This can't exist as an import-side concern
in the same way: import's duplicate detection runs through 9A's conflict *engine*
(existing DB rows vs. incoming), never a batch compared against itself.

If validation produces any error, `runXmlExport()`/`buildXmlExportPlan()` never calls
the formatter — no partially-invalid XML is ever generated.

## 8. Automated test results

`xmlExport.test.html` — **65/65 checks passed**, run headlessly, fully offline (no live
Supabase touched — every mapper/formatter/writer/validator check runs against synthetic,
hand-built "DB row" objects, same convention 9B established):

```
python -m http.server 8743
chrome --headless=new --disable-gpu --virtual-time-budget=15000 --dump-dom \
  http://localhost:8743/js/services/dataExchange/xml/xmlExport.test.html
```

Coverage: the generic writer (escaping, self-closing, indentation, UTF-8 declaration),
formatter version, all four export mappers (including the dual-role-party and
opening-stock-present-vs-absent cases), master XML export re-parsed by 9B's own parser
(items, ledgers, groups, units, opening balance/stock), sales XML export re-parsed the
same way (single/multi-line, interstate vs. intrastate, cash-sale vs. named customer,
transcribed-not-recomputed totals), a 1,500-item large export (no O(n²) stall), UTF-8 and
special-character escaping round-tripped through export → re-parse, empty-database
export for both master and vouchers files (including the documented 9B-refusal case from
§6), output determinism (identical dataset exported twice → byte-identical XML),
validation (every reused rule plus `duplicateNameWithinBatchRule`, proven to collect
every issue in one pass), and the round-trip test below.

Regression, run the same way, unchanged:
- `xmlImport.test.html` (Milestone 9B): **83/83 passed**.
- `dataExchange.test.html` (Milestone 9A): **43/43 passed**.

`git diff --stat` against the pre-9C tree: only the two additive edits noted in §1, plus
new files under `xml/export/`, `xml/xmlExport.test.html`, and this report — zero business
logic, zero schema, zero UI changes.

## 9. Round-trip compatibility report

The mandatory acceptance test, run entirely with synthetic in-memory data (no live
Supabase reachable from this environment, same limitation as every prior milestone) —
export produced by 9C, fed directly into 9B's **unmodified** `buildXmlImportPlan()`:

**Master round-trip**: 2 items (one batch-tracked with a real opening-stock row, one
non-batch with no opening row) + 1 customer (with an opening balance) + 1 supplier,
exported then re-imported —
- Both items resolved back with names and GST rate (5%) intact.
- `trackBatches` survived correctly for both the batch-tracked and non-batch item.
- The customer resolved back with its opening balance (500) intact.
- The supplier resolved back correctly, classified under `Sundry Creditors`.
- Validation on the way back in: **0 errors**.

**Voucher round-trip**, using the master round-trip's items/parties as
"already-existing in the target company" (the same two-step workflow 9B's own test
suite already proves, now driven by 9C's actual export output):
- A walk-in (`customerId: null`) sale exported and re-imported still resolves to
  `customerId: null` — the "Cash Sale" semantic survives a full export→import cycle.
- A named-customer sale resolves to that customer's real (pre-existing) id, not a
  placeholder.
- Line quantity and rate survive the full cycle unchanged.
- No reference errors — both sales' item references resolved cleanly because the items
  were already known from the master round-trip.

**Result: round-trip compatibility passes for every entity type this milestone
supports**, with the one documented, expected exception in §6 (a wholly-empty vouchers
file, which no real Tally export would ever be either).

## 10. Formatter versioning

`tallyXmlFormatterV1.js` exposes `getFormatVersion()` → `{major:1, minor:0, patch:0,
label:'tally-xml'}`, built on 9A's existing `shared/version/` framework
(`createVersion`), confirmed unmodified since 9A. `xmlExporter.js`'s
`createXmlExporter()`/`runXmlExport()` accept `formatter`/`exporter` as injected
dependencies with defaults, mirroring 9B's `createXmlImporter({writers})` pattern — a
future Tally format revision or different ERP dialect becomes a new formatter file
implementing the same `IFormatter` contract, swapped in at the call site, never an edit
to this one.

## 11. Remaining work for Milestone 9D (Backup & Restore) and beyond

- **Backup/Restore itself**: entirely out of scope here, per instruction — not started.
- **Settings/export screen UI**: no such screen exists in this codebase (same finding as
  9B); `xmlExporter.js`/`download.js` are UI-independent and ready to be wired into one
  whenever it's built.
- **Voucher types beyond Sales**: unchanged from 9B's own remaining-work note — the
  moment an importer handler exists for Purchase/Manufacturing/Payment/Receipt/Journal,
  a symmetric export mapper + formatter branch can be added without touching the
  orchestration layer, but none exists yet because no validated import counterpart does.
- **Live-DB verification of `dataReaders.js`**: fully built and exercised via the offline
  test harness with synthetic rows, but never run against a live Supabase project from
  this environment (no credentials reachable here — same limitation noted in every prior
  milestone).
- **Opening-stock reconstruction for purchase-sourced batches**: not solvable within the
  current schema (§6) — would require either a schema change to retain a true opening
  snapshot per batch, or accepting the current, correctly-flagged limitation.

## 12. Architecture audit — 9A, 9B, 9C reviewed together

A read-only review of the whole Data Exchange Platform as it stands after three
milestones, from a long-term-maintainer's perspective rather than an implementation
one. No code was changed to produce this section; every finding below was verified
directly against the current source (grep'd, not assumed) before being written down.

### 1. Duplicated logic between the importer and exporter

**Finding.** No *business* logic is duplicated — GST math, invoice totals, and stock
mutation are computed exactly once (in `js/gst.js`/`js/sales.js`) and reused, never
reimplemented, in either direction. But the low-level **text-encoding conventions
specific to this XML dialect** are each implemented twice, independently:
- Tally's `GSTRATE` split: `itemMapper.js` *sums* Central+State into `gstRate` on
  import; `tallyXmlFormatterV1.js` independently *re-derives* `gstRate / 2` for
  Central/State Tax on export (confirmed: the literal expression `gstRate / 2` appears
  in both `itemExportMapper.js`'s `meta` population and `tallyXmlFormatterV1.js`'s
  `buildGstDetailsChildren`). This was a deliberate decoupling choice (documented
  in-code: the formatter re-derives rather than trusting a mapper-internal `meta`
  field), not an oversight — but it is, precisely, the same formula written twice.
- Tally's date convention: `parseTallyDate` (`YYYYMMDD` → `YYYY-MM-DD`) lives in
  `xml/mapping/parseHelpers.js`; its inverse, `formatTallyDate`, is a private function
  inside `tallyXmlFormatterV1.js` with no shared home.
- The "num unit"/"num/unit" combined-field convention: parsed by named, exported
  functions (`splitNumberSpaceUnit`, `splitNumberSlashUnit` in `parseHelpers.js`) on
  import; re-encoded by an anonymous inline template literal
  (`` `${line.rate}/${line.unit}` ``) directly inside the formatter on export, with no
  named counterpart at all.

**Recommendation.** Unify these into one bidirectional module (e.g.
`xml/mapping/tallyTextFormats.js`) holding both `parseX`/`formatX` pairs side by side.
This doesn't reduce any functionality — it just makes the inverse relationship between
import and export encoding explicit and co-located, so a future change to one direction
can't silently drift out of sync with the other.
**Timing: defer to 9D or a small standalone cleanup.** Nothing is broken today (the
round-trip tests prove both directions currently agree); this is a readability/
maintenance improvement, not a correctness fix, and 9B must stay unmodified per this
milestone's own rules — doing it now would mean editing 9B's `parseHelpers.js`, which
is out of scope for a "review only" audit turn regardless.

### 2. Modules that should be shared but exist twice

**Finding, confirmed by grep — two exact duplicates:**
- `function normalizeName (s) { return String(s ?? '').trim().toLowerCase(); }` exists
  verbatim in both `xml/conflicts/xmlConflictDetectors.js` (9B) and
  `xml/export/validators/xmlExportRules.js` (9C).
- A small `err()`/`warn()` "wrap `createDataExchangeError` with sensible defaults"
  helper is independently reimplemented in **three** files:
  `xml/validators/xmlBusinessRules.js`, `xml/tallyXmlParser.js`, and
  `xml/export/validators/xmlExportRules.js` — and the three implementations have
  already drifted slightly (different parameter shapes: `(message, entity, field)` in
  two of them, `(message, extra = {})` in the third), which is exactly the kind of small
  divergence that compounds the longer near-duplicate code goes unconsolidated.

**Recommendation.** Promote both into `shared/`: `normalizeName` into
`shared/` (or `xml/mapping/parseHelpers.js`, since both current call sites are
XML-specific), and a single `createRuleError(message, {code, category, severity,
entity, field, source})` factory into `shared/errors/`, replacing all three local
`err`/`warn` helpers.
**Timing: defer to 9D.** Both are mechanical, low-risk extractions with existing test
coverage to verify against — good "small PR" material, but not urgent, and (same as
above) touches 9B files this milestone shouldn't be editing.

### 3. Abstractions that became unnecessary after implementation

**Finding.** `shared/dependencyGraph.js` (9A) — a general-purpose, cycle-detecting
topological sort — has exactly **one** consumer across three milestones:
`xml/xmlImporter.js`, where it always resolves the same fixed order
(`item → customer → supplier → sale`) for every possible input, because Tally's entity
model has no genuinely data-dependent ordering question to answer. 9C's own plan
explicitly opted out of using it for export ordering, reasoning that "there's exactly
one valid static order to emit... the graph algorithm would add nothing" — and in
hindsight, that reasoning applies equally to 9B's usage, not just 9C's. The abstraction
isn't *wrong*, but three milestones in, it has never once been exercised with a
genuinely dynamic dependency set.

**Recommendation.** Don't remove it — a future format *could* have real conditional
dependencies, and it's cheap, well-tested infrastructure to have on hand. Instead,
record the lesson directly: default to a plain fixed-order array/list for any new
format's entity ordering, and reach for `createDependencyGraph()` only when an entity's
position in the order genuinely depends on runtime data (not just "it exists, so use
it"). **Timing: documentation-only, can happen now** — it's this paragraph, not a code
change.

A second, smaller instance: `export/exportPlan.js`'s `createExportPlan()` (9A) is
**never called anywhere** (confirmed by grep — its only reference is its own re-export
in `export/index.js`). 9C's `xmlExporter.js` built its own ad hoc plan shape
(`{kind, companyDto, items, parties, sales, validationResult, exportModel}`) rather than
wrapping it in `createExportPlan({entities, order, options})`. This mirrors 9B's
`import/importPlan.js` situation exactly (also thin, also not literally instantiated
by `xmlImporter.js`'s real return shape) — so it's a *pattern* across both milestones,
not a 9C-specific gap: the 9A "plan" contracts describe the *intent* of a planning
phase, and both concrete implementations satisfy that intent with a richer,
purpose-built object instead of literally constructing the generic wrapper.
**Recommendation:** either start actually constructing `createExportPlan()`/
`createImportPlan()` as part of (not instead of) the richer return shape, or
acknowledge in the 9A contract's own comment that concrete implementations are expected
to return a superset shape, not literally this factory's output. **Timing: defer** —
low-value, cosmetic-only either way, and touches 9A/9B files.

### 4. Unclear responsibility / separation-of-concerns

**Finding.** No serious violation. The one soft spot: `tallyXmlFormatterV1.js` embeds
two fixed constants (`GODOWN_NAME = 'Main Location'`, `DEFAULT_BATCH_NAME = 'Primary
Batch'`) that are legitimately Tally-structural (not business data — correctly placed
per the 3-layer split), but are unnamed/undiscoverable module-private constants rather
than something a future settings screen could ever surface or override.
**Recommendation.** If a future milestone ever wants these configurable, promote them
to named exports or a small options object accepted by `createTallyXmlFormatterV1()`.
**Timing: defer indefinitely** — no current requirement asks for this; premature to
build now.

A second, unrelated observation: `dataReaders.js`'s pagination helpers (`fetchAllPages`,
`chunk`) are generic Supabase-`.range()`-pagination utilities with **zero** XML/Tally
knowledge — they only live inside `xml/export/` because that's where the need first
arose. Any future bulk-read feature elsewhere in the app (reports, bulk export of
purchases, etc.) would currently have to re-derive the same offset-loop logic rather
than reuse this one. **Recommendation:** promote to a small, app-level
`js/services/pagination.js` (outside the Data Exchange Platform entirely, since it has
nothing to do with data exchange specifically). **Timing: defer** — no second consumer
exists yet to justify the move; premature abstraction until one does.

### 5. Naming inconsistencies across the platform

**Finding, confirmed by direct comparison of every mapper's exported function name:**

| Import (9B) | Export (9C) |
|---|---|
| `mapStockItemRecord` | `mapItemToExportDTO` |
| `mapLedgerRecord` | `mapPartyToExportDTOs` |
| `mapCompanyRecord` | `mapFirmToCompanyDTO` |
| `mapSalesVoucherRecord` | `mapInvoiceToSaleDTO` |

Import-side names itself after **Tally's** vocabulary (`StockItem`, `Ledger`,
`Voucher`); export-side names itself after **ApnaBill's** vocabulary (`Item`, `Party`,
`Invoice`). Each choice is individually defensible (a mapper arguably should be named
after the thing it's reading *from*), but the two together mean a contributor has to
learn two different naming conventions to work across both directions of what is
conceptually one layer. Relatedly, file names follow the same asymmetry:
`itemMapper.js` (import) vs. `itemExportMapper.js` (export) — the import side carries
no direction suffix at all, the export side always does.

A second instance: only the **formatter** is versioned (`tallyXmlFormatterV1.js`,
`getFormatVersion()`, per this milestone's own explicit instruction) — the **parser**
has no equivalent (`tallyXmlParser.js`, no version, no V1 suffix). If a future Tally
schema revision ever requires updating what the parser understands, there's no
established "add a new file, don't touch this one" story for that side the way there
now is for the formatter.

**Recommendation.** Not worth renaming working, tested code today. Worth writing down
as a convention for whichever milestone next touches this area: pick one vocabulary
(recommend ApnaBill's own DTO-oriented naming, since that's what the DTO layer itself
already uses) for all future mapper names in both directions, and decide explicitly
whether `tallyXmlParser.js` should eventually become `tallyXmlParserV1.js` for
symmetry, or whether the formatter's versioning was a one-off appropriate only because
export was the newer, less-proven direction. **Timing: defer** — purely cosmetic on
already-shipped, tested file/function names; a rename now is pure churn with no
functional benefit and would touch 9B files this milestone shouldn't modify.

### 6. Opportunities to simplify without reducing functionality

Every item above already doubles as a simplification opportunity (points 1, 2, and the
`dependencyGraph`/`exportPlan` observations in point 3 are the concrete list). No
*additional* simplification was found beyond those — in particular, the core pipeline
shape (`parser/formatter ↔ mapper ↔ DTO ↔ validation ↔ transaction/orchestration`) was
not found to have any redundant stage: every layer introduced in 9A is exercised by
both 9B and 9C, doing genuinely different work at each stage (confirmed while building
9C — nothing had to be duplicated *because* a 9A abstraction was missing; everything
that got duplicated was a case of not reaching for something that already existed).

### 7. Technical debt intentionally introduced during 9A–9C

1. The GST-rate-split duplication (§1) — low risk, but real; both copies must be kept
   in sync by hand if Tally's tax-head convention ever changes.
2. `normalizeName`/`err`/`warn` duplication (§2) — mechanical, low risk, easy 9D cleanup.
3. Opening stock is **not reconstructable** for any batch created via an ordinary
   purchase rather than XML import (documented in §6 of this report as a export-side
   limitation, but it is really a **schema-level** gap: `batches` has no `opening_qty`
   column, so nothing that ever reads this data — export, a future backup, a future
   audit report — can answer "what was this batch's true starting quantity" once
   `stock_ledger`'s `'opening'` row doesn't exist). **This is the one item on this list
   Milestone 9D should actively plan around**, since Backup & Restore will hit the exact
   same "what was the original state" question at a much larger scope than just
   opening stock.
4. `backup/`, `restore/`, and `export/exportPlan.js`'s contracts (9A) have gone three
   milestones without a single real implementation validating them — the same way
   `parsers/contract.js`/`exporters/contract.js`/`formatters/contract.js`'s
   illustrative, synchronous JSDoc signatures turned out to need pragmatic
   reinterpretation as async once 9B and 9C actually built against them, **9D should
   expect to renegotiate `backup/backupContract.js`/`restore/restoreContract.js`
   against real implementation constraints**, not assume they're already correct
   because they compile and nothing has contradicted them yet.

### Overall verdict

The core architecture — contract-first layering (parser/formatter, mapper, DTO,
validation, transaction/orchestration), enforced by `assertValid*` contract checks
rather than convention alone — held up well across three milestones and two data
directions without needing to bend. Nothing found in this audit is a structural flaw;
every finding is a small, mechanical, low-risk cleanup (consolidate a handful of
near-duplicate helpers, write down one ordering convention) rather than a sign the
platform needs rethinking. The one genuine piece of technical debt worth Milestone 9D
actively planning around, rather than opportunistically cleaning up, is finding #7.3 —
the schema's inability to retain a true "opening" snapshot beyond the one narrow path
9B's importer writes it through.
