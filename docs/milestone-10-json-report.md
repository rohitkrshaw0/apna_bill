# Milestone 10 — Universal JSON Data Exchange Platform: Report

Deliverables document for the JSON Export/Import adapters. Covers what was actually
built and verified; consult `docs/milestone-10-json-design.md` for the full design
reasoning (schema field-by-field rationale, what was reused vs. reimplemented and why,
the one deliberate cross-format-engine dependency) — not repeated here.

## 1. Objective

Add JSON as ApnaBill's canonical, format-neutral interchange schema by implementing two
new Migration Engine adapters — JSON Export and JSON Import — that plug into
`createMigrationEngine()` exactly like the existing XML adapters, with **zero** changes
to the Migration Engine itself, zero changes to any existing XML/backup/restore file,
zero schema changes, and zero network/cloud functionality.

## 2. Architecture implemented

```
runJsonExport(opts)                                 createJsonImporter().run(plan, opts)
  │                                                    │
  ▼                                                    ▼
createMigrationEngine().run(adapter, opts)   (SAME engine, SAME code path XML already runs on)
  │
  ├─ source.read()   buildJsonExportPlan() -- reuses xml/export/dataReaders.js's
  │                  fetchAllItems/fetchAllParties/fetchOpeningStockForItem/
  │                  fetchSalesInvoices + xml/export/mapping/**'s 4 ERP-agnostic
  │                  mappers, UNCHANGED, zero duplication
  │
  ├─ validators       json/rules/jsonBusinessRules.js (shared by both directions --
  │                    JSON's typed DTOs need no import/export split the way XML's
  │                    text-parse-failure flags forced)
  │
  ├─ detectors         xml/conflicts/xmlConflictDetectors.js's 3 detectors, reused
  │                    UNCHANGED (their messages were already format-neutral)
  │
  ├─ sink.write()      jsonFormatterV1.format() (export) / real business writers
  │                    createItem/createPartyQuick/createSupplier/saveSaleFromCart +
  │                    xml/writers/'s writeOpeningBalance/writeOpeningStock, reused
  │                    UNCHANGED (import)
  │
  └─ HistoryEntry + MigrationResult -- identical shape XML already produces
```

Architectural claim, verified not assumed: both new adapters run through
`migration/migrationEngine.js`'s existing, unmodified code — confirmed by `git diff`
showing zero lines changed anywhere under `migration/`, and by all 475 checks (366
pre-existing + 109 new) passing together in one sweep (§8).

## 3. Files added

**JSON format engine** (`js/services/dataExchange/json/`, 13 files, all new):

| File | Purpose |
|---|---|
| `shared/entityManifest.js` | The one canonical entity-type list (`item`/`customer`/`supplier`/`sale`), plural JSON keys, and dependency edges — a single source of truth from day one (see design doc §4 on why this avoids `.apnabill`'s own flagged 6-copy problem) |
| `shared/canonicalJson.js` | Primitive layer: `canonicalStringify()` — deterministic, key-sorted JSON serialization |
| `shared/checksum.js` | `computeChecksum()` — reuses `apnabill/zip/crc32.js`'s `crc32()` directly (the one deliberate cross-format-engine import, justified in design doc §9) |
| `shared/jsonVersion.js` | `getSchemaVersion()`/`getApplicationVersion()`/`getMinSupportedSchemaVersion()` |
| `rules/jsonBusinessRules.js` | `requiredFieldsRule`/`referencedEntitiesRule`/`duplicateNameWithinBatchRule` (JSON-worded, new) + `dateFormatRule`/`gstRateCrossCheckRule` (re-exported unchanged from `xml/validators/xmlBusinessRules.js`) |
| `export/jsonFormatterV1.js` | `IFormatter`: builds the canonical envelope, computes manifest checksums, serializes pretty/compact |
| `export/jsonExporter.js` | `buildJsonExportPlan()` + `createJsonExporter()` (`IExporter`) + `runJsonExport()` |
| `export/download.js` | `downloadJsonFile()` — browser download trigger, mirrors `xml/export/download.js` |
| `import/jsonParserV1.js` | `IDataParser`: structural + schema-compatibility + checksum validation, then parses directly to DTOs |
| `import/jsonImporter.js` | `buildJsonImportPlan()` + `createJsonImporter()` (`IImporter`) |
| `index.js` | Public barrel |
| `jsonExport.test.html` | 54 offline checks |
| `jsonImport.test.html` | 55 offline checks |

**Documentation** (3 files): `docs/milestone-10-json-design.md` (new),
`docs/milestone-10-json-report.md` (this document, new),
`docs/data-exchange-architecture.md` (updated, §4 below).

## 4. Files modified

None under `js/services/dataExchange/xml/`, `apnabill/`, or `migration/`. Verified
directly: `git status` before any commit shows only new, untracked files plus the one
architecture-doc edit — no existing file's content changed. This satisfies the
milestone's explicit "Existing XML functionality / Existing Backup functionality /
Existing Migration Engine behaviour" must-not-change constraints by construction, not
just by intent.

| File | What changed |
|---|---|
| `docs/data-exchange-architecture.md` | New §17 documenting the JSON format engine as a third format-engine peer of `xml/`/`apnabill/`; module map and folder-by-folder reference extended; §13's extension-point text annotated as now-proven (not just designed) |

## 5. What was reused, unmodified — the load-bearing decision

JSON's canonical entity representation *is* `dto/*` directly (no Tally-style structural
layer needed in between), which is what makes the following reuse possible without
copying business logic:

- **Data reads**: `fetchAllItems`, `fetchAllParties`, `fetchOpeningStockForItem`,
  `fetchSalesInvoices` — imported directly from `xml/export/dataReaders.js`.
- **DTO mapping**: `mapFirmToCompanyDTO`, `mapItemToExportDTO`, `mapPartyToExportDTOs`,
  `mapInvoiceToSaleDTO` — imported directly from `xml/export/mapping/**`.
- **Opening-value writers**: `writeOpeningBalance`, `writeOpeningStock` — imported
  directly from `xml/writers/*`.
- **Conflict detectors**: `duplicateItemNameDetector`, `duplicateLedgerNameDetector`,
  `duplicateInvoiceNumberDetector` — imported directly from `xml/conflicts/xmlConflictDetectors.js`.
- **Two business rules**: `dateFormatRule`, `gstRateCrossCheckRule` — imported directly
  from `xml/validators/xmlBusinessRules.js`.
- **Every real business writer**: `createItem`, `createPartyQuick`, `createSupplier`,
  `saveSaleFromCart`, `deleteItemHard`, `setSupplierActive` — from `js/items.js`,
  `js/sales.js`, `js/suppliers.js`, unchanged.
- **Every Migration Engine capability**: validators pipeline, conflict engine,
  dependency graph, progress tracker, history entry, transaction engine (LIFO rollback),
  `import/importPlan.js` — the exact same shared infrastructure XML runs on, zero
  duplication of orchestration logic anywhere.

Full rationale for what was *not* reused (and why each of those cases is a small,
individually-justified exception, not scope creep) is in the design doc §3.

## 6. The canonical JSON schema (summary)

One versioned envelope: `schemaVersion`, `generator` (application/engine identity),
`metadata` (timestamp, exportedBy, companyId, scope, requestedEntities),
`compatibility` (min/max schema version), `company`, `manifest` (entities present,
recordCounts, checksums), `entities` (items/customers/suppliers/sales arrays),
`relationships` (dependency edges as data), `warnings`, `featureFlags`,
`futureReserved`. Deterministic (key-sorted, array-order-preserving serialization) and
checksummed per-entity-array plus once for the whole envelope. Scope: `item`/`customer`/
`supplier`/`sale` — matching exactly what XML import/export already supports end-to-end
(Purchase/Manufacturing/Stock/Settings DTOs exist in `dto/` since 9A but are consumed by
no format engine yet, XML included; extending the manifest to cover them is a clean
future milestone, design doc §11). Full field-by-field rationale: design doc §5.

## 7. Behavior notes

- **Export produces one unified file** covering all requested entity types in a single
  envelope (unlike XML's master/vouchers split) — `scope: 'entities'` + a requested-type
  list is how a caller asks for a subset; omitting it exports the whole company.
- **Pretty vs. compact never changes checksums** — checksums are computed over the
  canonical *object*, not either textual rendering. Verified directly (§8): pretty and
  compact exports of identical data carry byte-identical `manifest.checksums`.
- **Import never trusts a foreign database id.** A sale's `customerId` and each line's
  `item_id`, as exported, are the *source* company's real UUIDs. Import resolves both
  **by name** (`meta.partyName` / `line.item_name`) against the target company's
  existing records first, then whatever the current batch itself just created — the
  identical two-tier strategy `xmlImporter.js`'s own `resolveSaleReferences()` already
  uses for XML, reimplemented (not imported, since touching `xmlImporter.js` was out of
  scope) with JSON's own field names. Verified directly (§8): a dedicated test resolves
  a sale against a target-company record that was never created by the current import
  batch, and asserts the foreign source-company id is never the one actually used.
- **Import has no validation self-gate in `run()`**, matching `xmlImporter.js`'s own
  documented behavior exactly: `buildJsonImportPlan()`'s `validationResult` is the sole
  gate, a caller's responsibility to check before calling `run()`. Verified directly by
  a dedicated test.
- **Sale writes still cannot be undone** — the identical, already-documented no-op
  `xmlImporter.js`'s own `writers.sale.undo` has, for the identical reason (no
  `voidSale`/`deleteSale` exists anywhere in the app).
- **Opening stock/balance data is preserved**, not silently dropped, despite JSON having
  no separate "opening stock" sibling channel the way the mapper's own return shape
  does — folded into each record's own `meta.opening`/`meta.openingBalance` at the
  export layer (not by modifying `itemDTO.js`/mapper files themselves) and read back out
  symmetrically on import.

## 8. Regression results

Full sweep, run repeatedly (including after the one test-fixture correction noted below)
via `python -m http.server` + headless Chrome `--dump-dom`, identical harness invocation
every existing milestone report already uses:

| Suite | Result |
|---|---|
| `dataExchange.test.html` (9A) | 43/43 ✅ |
| `xmlImport.test.html` (9B) | 83/83 ✅ |
| `xmlExport.test.html` (9C) | 74/74 ✅ |
| `apnabill.test.html` (9D) | 49/49 ✅ |
| `apnabillRestore.test.html` (9E) | 69/69 ✅ |
| `migration.test.html` (9F) | 48/48 ✅ |
| `json/jsonExport.test.html` (10, new) | 54/54 ✅ |
| `json/jsonImport.test.html` (10, new) | 55/55 ✅ |
| **Total** | **475/475 ✅** |

**One issue was caught and fixed while writing `jsonExport.test.html`**: an early
version of the "same input produces byte-identical output" determinism check called
`formatter.format()` twice without pinning `meta.exportTimestamp`, so the two calls
legitimately produced different `metadata.exportTimestamp` values a millisecond apart —
correct behavior (every real export should carry a fresh, genuine timestamp), not a
product bug. The test was corrected to pin an explicit timestamp, which is what
determinism actually needs to mean here; re-run clean twice in a row afterward with no
flakiness. No product code changed as a result of this. This is the only issue found at
any point during this milestone — zero regressions in any of the 366 pre-existing checks
at any point.

## 9. New test coverage

- **`json/jsonExport.test.html`** (54 checks): `canonicalStringify` determinism/key-sort
  behavior, `computeChecksum` determinism and tamper-sensitivity, `entityManifest`/
  `jsonVersion` shape, all 5 business rules (JSON wording, no leaked Tally terms),
  `buildEnvelope()`'s full field shape and manifest correctness, pretty-vs-compact
  checksum equivalence, byte-identical determinism (with a pinned timestamp),
  `runJsonExport()`'s prepare→export→finalize call order and invalid-plan short-circuit
  (mirroring `xmlExport.test.html`'s own two happy/invalid-path checks), and a full
  **export→import round trip** proving both directions interoperate — something XML's
  own test harnesses cannot do purely offline, since XML's formatter/parser both remain
  Tally-XML-specific while JSON's parser and formatter are both fully offline-callable
  end to end.
- **`json/jsonImport.test.html`** (55 checks): structural/schema/checksum validation
  (malformed JSON, missing manifest/entities, major-version rejection, older-than-min
  rejection, newer-minor-version forward-tolerance-as-warning, checksum tampering at
  both the per-entity and envelope level, unknown entity key ignored safely), the full
  plan pipeline (business-rule failures, all 3 reused conflict detectors, preview
  classification, dependency ordering, partial imports, opening-value metadata
  survival), and `createJsonImporter()`'s write order / by-name reference resolution
  (both this-batch-created and pre-existing-in-target-company cases) / LIFO rollback
  and undo ordering / commit path / no-self-gate behavior / progress event counts —
  the same rigor `xmlImport.test.html`'s own transaction/rollback/progress fixtures
  apply to XML.

## 10. Remaining technical debt

- **Purchase/Manufacturing/Stock/Settings entities are out of scope**, matching (not
  falling short of) what XML import/export already supports — extending
  `entityManifest.js` with a reader+mapper per entity is the documented next step
  (design doc §11), not attempted here to avoid inventing new, unreviewed data-access
  logic nothing else in the platform has ever exercised.
- **`crc32.js` still lives under `apnabill/zip/`**, imported cross-format by `json/`
  rather than promoted to `shared/` — a deliberate, disclosed choice (design doc §9) to
  avoid touching an existing, tested backup file for a purely cosmetic relocation.
  Promoting it properly is a clean future cleanup, not forgotten.
- **No real `applicationVersion` constant exists anywhere in this codebase** — confirmed
  before writing `jsonVersion.js`, not assumed. `getApplicationVersion()`'s declared
  marker (`1.0.0-apnabill-app`) is the one place to wire in a real one later, exactly
  mirroring how `apnabillArchiveFormatterV1.js`'s `getFormatVersion()` already handles
  the same absence for format-level versioning.
- **`MAX_JSON_BYTES`'s cap (200MB) is exported but not exercised by a real oversized
  file in the test suite** — generating a 200MB string offline in a browser test harness
  was judged not worth the runtime cost; the constant and the comparison logic it feeds
  are both straightforward enough that this is a disclosed, not hidden, gap (matching
  this platform's own "documented limitations over hidden ones" principle).
- **This milestone is the first genuinely independent proof of
  `docs/milestone-9f-migration-report.md` §10's own flagged gap** ("no fifth adapter
  exists yet to validate the near-zero engine changes claim") — confirmed true: zero
  lines changed under `migration/` for this entire milestone. A CSV/Excel adapter now
  has two prior-art templates (XML, JSON) instead of one.

## 11. Final assessment

JSON Export and JSON Import are implemented as two more callers of
`createMigrationEngine().run(adapter, opts)`, proving the Migration Engine's
capability-based adapter contract genuinely supports an entirely new format with zero
engine changes — not asserted, verified: `git diff` shows no line changed under
`migration/`, and all 475 checks (366 pre-existing, unmodified, plus 109 new) pass in one
sweep. No existing file under `xml/`, `apnabill/`, or `migration/` was modified. No
database schema, public API, or business workflow changed. JSON's canonical schema is
versioned, deterministic, checksummed, and — because JSON's DTOs are the platform's own
format-independent `dto/*` shapes rather than a Tally-specific structural layer — reuses
substantially more of the existing platform than XML itself was able to (data readers,
mappers, opening-value writers, and all three conflict detectors, all imported
unchanged). The one deliberate architectural exception (a cross-format-engine import of
`apnabill/zip/crc32.js`'s pure checksum primitive) is disclosed and justified against
its two rejected alternatives rather than made silently. The milestone is complete and
ready for review.
