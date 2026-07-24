# Milestone 10 — Universal JSON Data Exchange Platform: Design

Design and architecture reference for the JSON Export/Import adapters, written after a
complete study of `docs/data-exchange-architecture.md`, `docs/milestone-9a` through
`docs/milestone-9f-migration-report.md`, and every file under
`js/services/dataExchange/`. This document covers what was decided and why; the
companion `docs/milestone-10-json-report.md` covers what was actually built and
verified.

## 1. Objective

JSON becomes ApnaBill's canonical, format-neutral interchange schema — not "one more
export format" alongside Tally XML, but the shape every future integration (desktop,
mobile, cloud, ERP connectors, AI/analytics tooling) is expected to read and write. This
milestone adds exactly two new Migration Engine adapters — JSON Export and JSON Import —
implemented as thin format translators on top of infrastructure that already exists
(§2a of the architecture doc). No change to the Migration Engine, no change to any
existing XML/backup/restore file, no schema change, no network/cloud feature.

## 2. Why the Migration Engine needs no changes

Per `docs/data-exchange-architecture.md` §13 and `docs/milestone-9f-migration-engine-design.md`
§17, a new export format needs an `IExporter`+`IFormatter` pair described as a
`single-shot`/`none` `MigrationAdapter`; a new import format needs an `IDataParser` plus
an `IImporter` described as a `per-unit`/`lifo` `MigrationAdapter` that dispatches to
already-existing real writers. Both shapes are exactly what `xmlExporter.js`/
`xmlImporter.js` already prove out, and `migrationAdapter.js`'s capability-based contract
(only `source`/`sink`/`executionMode` required) has no XML- or ZIP-specific assumption
anywhere in it — confirmed by reading `migrationEngine.js` and `migrationAdapter.js` in
full. JSON Export/Import are built as two more callers of
`createMigrationEngine().run(adapter, opts)`, identical in shape to the XML pair, and
**this claim is verified, not assumed**: both new adapters pass through the same engine
code path exercised by 366/366 existing checks, with zero lines changed in
`migration/`.

## 3. What is reused, unmodified, byte-for-byte

This is the load-bearing design decision of this milestone: JSON's DTOs are **exactly**
`dto/*`'s existing format-independent shapes. Unlike Tally XML (which needs its own
tag-name/structural vocabulary layered over the DTOs), JSON's canonical entity
representation *is* the DTO layer, serialized directly. That equivalence is what makes
the following reuse possible without copying a single line of business logic:

| Reused as-is | From | Why it's safe to reuse |
|---|---|---|
| `fetchAllItems`, `fetchAllParties`, `fetchOpeningStockForItem`, `fetchSalesInvoices` | `xml/export/dataReaders.js` | Its own header comment already documents these as generic Supabase reads with no Tally knowledge — confirmed by reading the file: no tag name, no Tally string, anywhere in it. |
| `mapFirmToCompanyDTO`, `mapItemToExportDTO`, `mapPartyToExportDTOs`, `mapInvoiceToSaleDTO` | `xml/export/mapping/**` | Each file's own header comment self-declares "ERP-agnostic... No Tally tag names" — confirmed directly: every one of them imports only `dto/*` and produces a plain DTO (+ neutral opening-balance/opening-stock siblings). Tally structure is `tallyXmlFormatterV1.js`'s job alone. |
| `writeOpeningBalance`, `writeOpeningStock` | `xml/writers/*` | Both call generic RPCs (`record_opening_stock`) / a plain column update — zero Tally knowledge, confirmed by reading both files. |
| `dateFormatRule`, `gstRateCrossCheckRule` | `xml/validators/xmlBusinessRules.js` | Their error messages name no Tally tag ("Item ... Central Tax ... does not match Integrated Tax", "invoiceDate ... is not YYYY-MM-DD") — safe to surface verbatim to a JSON user. |
| `duplicateItemNameDetector`, `duplicateLedgerNameDetector`, `duplicateInvoiceNumberDetector` | `xml/conflicts/xmlConflictDetectors.js` | Their messages ("An item named X already exists in this company") are entirely format-neutral. |
| `createItem`, `createPartyQuick`, `createSupplier`, `saveSaleFromCart`, `deleteItemHard`, `setSupplierActive` | `js/items.js`, `js/sales.js`, `js/suppliers.js` | The app's own real business functions — the only ones any import path is allowed to call, XML or JSON alike. |
| Every Migration Engine capability (`validators/`, `conflicts/conflictEngine.js`, `shared/dependencyGraph.js`, `progress/progressTracker.js`, `history/historyEntry.js`, `transactions/transactionEngine.js`, `import/importPlan.js`) | unchanged | Same mechanism XML already runs on; see §2. |
| `crc32`/`crc32Init`/`crc32Update`/`crc32Finalize` | `apnabill/zip/crc32.js` | Its own header comment self-declares "Zero business/archive-format knowledge -- a pure, generic checksum primitive." This is the **one cross-format-engine import** this milestone introduces (`json/` importing a pure primitive from `apnabill/`) — see §9 for the explicit justification. |

**Not reused, deliberately rewritten** (small, and justified individually):

- `requiredFieldsRule`, `referencedEntitiesRule` — XML's versions embed Tally tag names
  in their error text (`"STOCKITEM missing required NAME"`, `` `STOCKITEMNAME "${..}"` ``).
  Surfacing those strings to a JSON caller would be actively misleading (there is no
  `STOCKITEM` in a JSON file). `json/rules/jsonBusinessRules.js` reimplements the same
  two checks — identical logic, JSON-appropriate wording — a handful of lines, the same
  proportionate choice `xml/export/validators/xmlExportRules.js` already made when it
  wrote its own `duplicateNameWithinBatchRule` instead of stretching an import-side rule
  to cover an export-only case.
- `quantitySplitRule` — checks a text-parse-failure flag (`__rateUnparseable`) that can
  only exist when the source was raw Tally text. JSON's DTOs are already-typed numbers
  (whether produced by a DB read on export, or `JSON.parse` on import) — this failure
  mode cannot occur, so the rule is not reused, exactly as `xmlExportRules.js` already
  documents for its own (different) reason not to reuse it either.
- `ledgerBalanceRule` — checks `dto.meta.ledgerEntriesSum`, a value only XML's voucher
  mapper ever populates. JSON's sale DTOs never set it; the rule would be permanently
  inert, so it is not included.
- The item/customer/supplier/sale write-dispatch table (`entityType -> {write, undo}`)
  — structurally similar to `xmlImporter.js`'s private `defaultWriters`, but not
  imported from it, because `defaultWriters` is not exported (only the two opening-value
  writer *functions* are, via `xml/index.js`), and this milestone's explicit constraint
  is to touch zero existing XML files. Per the architecture doc §10.1, "business-specific
  mapping... is entirely adapter-owned" — the ~10-line-per-entity dispatch glue is
  adapter orchestration, not Migration Engine logic, so a second, independent
  declaration for JSON is the correct shape, not duplication of what the brief means by
  "no duplicated orchestration logic" (planning/validation/rollback/reporting — the parts
  that actually are fully shared, via the engine).

## 4. One canonical entity manifest (fixing 9F's own flagged anti-pattern, from day one)

`docs/milestone-9f-migration-report.md` §3.5 records that `.apnabill`'s 21-table list
exists as **six** independent copies today, each file's own comment admitting this is a
deliberate-but-regrettable trade-off. JSON does not repeat that mistake: one file,
`json/shared/entityManifest.js`, is the single source of truth for the four entity types
this milestone supports (`item`, `customer`, `supplier`, `sale`), their JSON envelope
plural key (`items`/`customers`/`suppliers`/`sales`), and the one dependency edge set
(`sale` depends on `item`/`customer`/`supplier`) — imported by both the export and import
adapters, never re-declared.

**Scope note:** `dto/purchaseDTO.js`, `manufacturingDTO.js`, `stockDTO.js`, and
`settingsDTO.js` already exist in the DTO layer (built in 9A) but have never been
consumed by any format engine — XML export/import supports Sales vouchers only. This
milestone keeps that same scope for JSON (matching, not exceeding, what the platform
already proves end-to-end) rather than inventing new, unreviewed data-reader/writer
logic for entities nothing has ever exercised. Extending the entity manifest to cover
Purchase/Manufacturing/Stock/Settings is a natural, near-zero-engine-change future
milestone — add reader + mapper + manifest entry, exactly as this milestone's own §11
describes for a hypothetical fifth format.

## 5. The canonical JSON schema

One versioned envelope, produced and consumed byte-identically by both directions:

```jsonc
{
  "schemaVersion": "1.0.0",
  "generator": {
    "application": "ApnaBill",
    "applicationVersion": "1.0.0-apnabill-app",
    "engine": "migration-engine",
    "engineVersion": "1.0.0"
  },
  "metadata": {
    "exportTimestamp": "2026-07-24T10:15:30.000Z",
    "exportedBy": "user@example.com",       // null when unavailable offline
    "companyId": "…uuid…",
    "scope": "company",                      // "company" | "entities"
    "requestedEntities": null                // e.g. ["item","sale"] when scope is "entities"
  },
  "compatibility": {
    "minSupportedSchemaVersion": "1.0.0",
    "maxKnownSchemaVersion": "1.0.0"
  },
  "company": { "__dtoType": "company", "id": "…", "name": "…", "…": "…" },
  "manifest": {
    "entities": ["item", "customer", "supplier", "sale"],
    "recordCounts": { "item": 12, "customer": 3, "supplier": 1, "sale": 40 },
    "checksums": {
      "item": "crc32:1a2b3c4d",
      "customer": "crc32:2b3c4d5e",
      "supplier": "crc32:3c4d5e6f",
      "sale": "crc32:4d5e6f70",
      "envelope": "crc32:5e6f7081"
    }
  },
  "entities": {
    "items": [ /* itemDTO[] */ ],
    "customers": [ /* customerDTO[] */ ],
    "suppliers": [ /* supplierDTO[] */ ],
    "sales": [ /* saleDTO[] */ ]
  },
  "relationships": [ ["sale", "item"], ["sale", "customer"], ["sale", "supplier"] ],
  "warnings": [],
  "featureFlags": {},
  "futureReserved": {}
}
```

Field-by-field rationale:

- **`schemaVersion`** — the canonical schema's own version (`shared/version/` `createVersion`
  formatted via `formatVersion`), independent of `applicationVersion`. A future breaking
  schema change bumps the major; an additive field bumps the minor.
- **`generator.applicationVersion`** — no app-wide version constant exists anywhere in
  this codebase today (confirmed: no `package.json`, no `VERSION` file, no exported
  constant under `js/`). Per the "never infer or fabricate data" principle, this
  milestone does not invent a *real* app version number; it declares a new, minimal
  version marker (`json/shared/jsonVersion.js`'s `getApplicationVersion()`), the exact
  same pattern `apnabillArchiveFormatterV1.js`'s `getFormatVersion()` already established
  for format-level versioning out of nothing. A future maintainer wiring up a real
  app-version constant only needs to change that one function.
- **`metadata.exportedBy`** — `supa.auth.getUser()`'s email, dynamically imported exactly
  like every other Supabase-touching call in this platform; `null` when unavailable
  (never fabricated).
- **`metadata.scope`/`requestedEntities`** — satisfies "Entire Company / Single Entity /
  Multiple Entities / Selective Export" directly: `scope: 'entities'` plus a
  `requestedEntities` array is how a caller asks for a subset; omitting `entities` from
  `opts` exports the whole company (all four entity types this milestone supports).
- **`compatibility`** — mirrors `apnabillRestoreProvider.js`'s `validateVersion()` design
  exactly (major mismatch = reject, older-than-min = reject, newer minor/patch =
  warning), just expressed as data in the envelope itself rather than a hardcoded
  constant only the restore provider knows, since a JSON file may be read by a
  completely different, future system that isn't this codebase at all.
- **`manifest.recordCounts`/`checksums`** — nested under `manifest` rather than as two
  more top-level siblings: the brief's field list is not itself a nesting diagram, and
  "how many of each entity, and does the content check out" is naturally one manifest
  concept, exactly how `.apnabill`'s own `manifest.json` already bundles `files` +
  implicit counts together. `checksums.envelope` covers the whole `entities` block (see
  §6); one checksum per entity array additionally isolates *which* entity type is
  corrupt, information a single whole-file checksum can't give you.
- **`relationships`** — literally `entityManifest.js`'s dependency edges, serialized as
  data, not because JSON import strictly needs them (see §7 — the dependency graph is
  still recomputed independently on import, never trusted blindly from a foreign file)
  but because a genuinely external consumer (an ERP connector, an AI system) benefits
  from being told "sale depends on item/customer/supplier" without having to reverse
  engineer it from the data.
- **`warnings`** — carries forward whatever the exporting side's own validation pipeline
  already found (e.g. a GST cross-check mismatch) — informational, never blocks import.
- **`featureFlags`**/**`futureReserved`** — explicitly empty, reserved extension points a
  future minor schema version can populate without a major bump. Never read or written
  beyond pass-through by this milestone's own code.

## 6. Determinism, ordering, and checksums

"Stable ordering / deterministic ordering / repeatable output / canonical formatting"
(brief) is implemented at two levels:

1. **Record ordering.** `fetchAllItems`/`fetchAllParties` already order by `name`;
   `fetchSalesInvoices` already orders by `invoice_date` then `invoice_no` (confirmed by
   reading `dataReaders.js` — this is the same DB-level ordering XML export already
   relies on). `jsonFormatterV1.js` does not re-sort — sorting is the data reader's job,
   not the formatter's, to avoid a second, possibly-inconsistent sort key living in two
   places.
2. **Key ordering.** `json/shared/canonicalJson.js`'s `canonicalStringify()` recursively
   sorts every plain object's keys alphabetically before `JSON.stringify` (arrays keep
   their element order — that's record ordering, item 1's job). This makes output
   byte-identical for byte-identical input regardless of how a DTO's fields happened to
   be inserted (relevant for open-ended `meta`/`values` bags like `settingsDTO`, where
   insertion order isn't otherwise guaranteed) — a pure, zero-business-knowledge
   primitive, mirroring `tallyXmlWriter.js`'s role relative to `tallyXmlFormatterV1.js`.

**Checksums** use `crc32` (imported from `apnabill/zip/crc32.js`, see §3/§9) computed over
each entity array's own `canonicalStringify()` output, plus one more over the entire
`entities` object — computed and inserted into `manifest.checksums` *after* every other
field of the envelope is final, so the checksums cover exactly what a consumer will read
back. Import-side validation recomputes all four and compares (§7) — a mismatch is a
hard validation error, exactly as `apnabillBackupProvider.js`'s `verify()` treats a
CRC-32 mismatch on its ZIP entries.

## 7. Export pipeline

```
buildJsonExportPlan(opts)                          json/export/jsonExporter.js
  { scope, entities, activeOnly, firmId, dateFrom, dateTo }
  -> fetchAllItems/fetchAllParties/fetchOpeningStockForItem/fetchSalesInvoices  (reused, §3)
  -> mapItemToExportDTO/mapPartyToExportDTOs/mapInvoiceToSaleDTO/mapFirmToCompanyDTO  (reused, §3)
  -> filter to opts.entities when scope === 'entities'
  -> validate (jsonBusinessRules.js, reusing dateFormatRule/gstRateCrossCheckRule + new
     requiredFieldsRule/referencedEntitiesRule/duplicateNameWithinBatchRule)
  -> { companyDto, byType: {item,customer,supplier,sale}, validationResult, exportModel }

createJsonExporter()  -- IExporter (prepare/export/finalize), produces DTOs only

runJsonExport(opts)   -- MigrationAdapter: source.read = buildPlan + exporter's own
  prepare/export/finalize (unconditional, same pattern as runXmlExport()); sink.write =
  jsonFormatterV1.format(exportModel, { pretty, includeChecksums }) -> { json, bytes,
  envelope }; executionMode 'single-shot'; rollbackStrategy 'none'; historyType 'export'.
  createMigrationEngine().run(adapter) exactly as runXmlExport() already does.
```

Whole-company vs. selective export is a data-fetch/filter decision inside
`buildJsonExportPlan()`, not a Migration Engine concern — the plan simply omits any
entity type not requested before DTOs are ever validated or formatted, so a
`scope: 'entities'` export never even reads tables it wasn't asked for. Pretty vs.
compact is a pure formatting choice (`JSON.stringify(canonicalObj, null, pretty ? 2 :
undefined)`) inside `jsonFormatterV1.js`'s own `format()`, with no effect on
`manifest.checksums` (checksums are computed over the canonical *object*, not over
either textual rendering, so pretty and compact exports of the same data always carry
identical checksums — verified directly by a dedicated test, §12).

## 8. Import pipeline

```
buildJsonImportPlan(source, opts)                   json/import/jsonImporter.js
  { existingItems, existingParties, existingInvoices }
  -> jsonParserV1.validate(source)   -- well-formed JSON, byte cap, envelope shape,
     schemaVersion compatibility (compatibility block), per-entity + envelope checksum
     verification (§6) -- ALL of this before a single DTO is ever produced, mirroring
     tallyXmlParser.js's validate()-before-parse() split
  -> jsonParserV1.parse(source)      -- entities.items/customers/suppliers/sales ->
     deepFreeze()'d directly (NOT re-run through createItemDTO()/etc. -- the file
     already contains exactly the DTO shape that was serialized; reconstructing through
     a factory would silently apply that factory's own defaults to any field the file
     legitimately omitted, which is exactly the kind of fabrication §14.4 of the
     architecture doc forbids)
  -> validate (same jsonBusinessRules.js pipeline as export, §7)
  -> detect conflicts (duplicateItemNameDetector/duplicateLedgerNameDetector/
     duplicateInvoiceNumberDetector, reused unchanged from xml/conflicts/, §3)
  -> classify (previewModel: NEW/EXISTING/DUPLICATE/INVALID, same buildPreviewItem
     shape xmlImporter.js already uses)
  -> order (entityManifest.js's dependency edges, via the same shared/dependencyGraph.js
     call xmlImporter.js already makes -- item/customer/supplier -> sale)
  -> ImportPlan (import/importPlan.js's createImportPlan(), same factory xmlImporter.js
     already uses -- never writes anything; the confirmation gate)

createJsonImporter()   -- IImporter: prepare()/run(plan, {transactionEngine,
  progressTracker})/getResult(), describing a MigrationAdapter exactly like
  createXmlImporter().run() does: executionMode 'per-unit', rollbackStrategy 'lifo',
  sink.write dispatches to the entity-type writer table (§3's "not reused, deliberately
  rewritten" item), undo callbacks registered per successful write, LIFO rollback on
  first failure (transactions/transactionEngine.js, unchanged). No validation self-gate
  in run() itself, matching xmlImporter.js's own documented behavior exactly --
  buildJsonImportPlan()'s validationResult remains the sole gate, a caller's
  responsibility to check, for the same reason 9F's design explicitly preserved this for
  XML import (approved design §19's risk note).
```

**Reference resolution never trusts a foreign database id.** A sale DTO's `customerId`
and each line's `item_id`, as exported, are the *source* company's real UUIDs — meaningless
(or worse, silently wrong) if blindly reused against a *different* target company/database,
which is exactly the cross-instance scenario JSON exists to support. Every sale line
already carries `item_name` (from `mapInvoiceToSaleDTO`, reused unchanged, §3); every sale
DTO already carries `meta.partyName`. Import resolves both **by name** — first against
`opts.existingItems`/`existingParties` (the target company's current data), then against
whatever this batch itself just created — the exact same two-tier lookup
`resolveSaleReferences()` already performs for XML import, reimplemented here (not
imported, for the same "don't touch xmlImporter.js" reason as §3's writer-table note) with
`meta.partyName` as the lookup key instead of XML's `BY_NAME_PREFIX`-tagged string. The
DTO's own `id`/`customerId`/`item_id` fields are preserved verbatim in the JSON for
round-trip fidelity and information only — never treated as authoritative during import.
This is what makes the same exported file safely re-importable into a different company
without silent id collisions.

**Sale writes still cannot be undone**, for the identical, already-documented reason
`xmlImporter.js`'s own `writers.sale.undo` is a no-op: no `voidSale`/`deleteSale` exists
anywhere in the app. JSON import's sale writer inherits the same explicit, flagged no-op
— not silently, not by omission.

## 9. The one cross-format-engine dependency, justified

Every other file this milestone adds lives entirely under the new `json/` folder and
depends only on `shared/`, `dto/`, `validators/`, `conflicts/`, `preview/`,
`shared/dependencyGraph.js`, `import/importPlan.js`, `migration/`, and (for the mapper/
reader/writer reuse in §3) specific, individually-named files under `xml/` that
self-declare themselves format-neutral. The one exception is `crc32`/`crc32Init`/
`crc32Update`/`crc32Finalize`, imported from `apnabill/zip/crc32.js`.

This was a deliberate choice, not an oversight, weighed against two alternatives:

1. **Duplicate the ~30-line CRC-32 table+function into a new `json/shared/checksum.js`.**
   Rejected: this is precisely the kind of "no duplicated code" the brief explicitly
   forbids, for a pure algorithm with zero reason to diverge between the two call sites.
2. **Move `crc32.js` into `shared/`, updating `apnabillArchiveFormatterV1.js`'s one
   import.** Rejected: touches an existing, tested, "byte-for-byte unchanged" backup
   file for a milestone whose explicit brief is "Existing Backup functionality" must not
   change — a real (if small) regression-surface increase for a purely cosmetic
   relocation.

Importing the already-generic primitive directly is the smallest, safest option: zero
existing files change, and `crc32.js`'s own header comment already documents it as
having "Zero business/archive-format knowledge" — it was simply never relocated out of
`apnabill/zip/` because it had exactly one consumer before this milestone. A future
milestone touching both formats again is free to promote it into `shared/` properly;
this milestone does not force that decision.

## 10. Testing strategy

Two new offline, dependency-free harnesses, same convention as every other format engine
(architecture doc §14.10): `json/jsonExport.test.html`, `json/jsonImport.test.html`.
Covers (per the brief's own list): canonical/pretty/compact export, stable+deterministic
ordering (same input twice -> byte-identical output), checksum generation and mismatch
detection, manifest generation, schema validation (missing `schemaVersion`, unknown major
version, missing `manifest`, corrupt JSON text), import preview, dry run (validate
without executing), conflict detection (all three reused detectors), rollback (LIFO undo
on a mid-batch failure, mirroring `xmlImport.test.html`'s own undo-order assertions),
verification, partial vs. whole import, unknown entity type, dependency ordering, and
forward/backward compatibility (a newer minor `schemaVersion` warns, not fails; an older
major fails). Existing suites (`dataExchange.test.html`, `xmlImport.test.html`,
`xmlExport.test.html`, `apnabill.test.html`, `apnabillRestore.test.html`,
`migration.test.html` — 366 checks total) are re-run unmodified as the zero-regression
gate; see `docs/milestone-10-json-report.md` §8 for actual results.

## 11. Future extension points opened by this milestone

- **Purchase/Manufacturing/Stock/Settings entities** — add a data reader + mapper (none
  exist yet for these, XML included) and one `entityManifest.js` entry each; no
  Migration Engine or canonical-schema-shape change needed.
- **CSV/Excel** — this milestone is the first proof (per
  `docs/milestone-9f-migration-report.md` §10's own flagged gap: "no fifth adapter exists
  yet to validate the near-zero engine changes claim") that a genuinely new format
  reuses the engine with zero changes to `migration/migrationEngine.js`. A CSV/Excel
  adapter can now point at this milestone as its own template.
- **A real `applicationVersion` constant**, once one exists anywhere in the codebase —
  `json/shared/jsonVersion.js`'s `getApplicationVersion()` is the one place to wire it in.
- **Promoting `crc32.js` to `shared/`** — deferred per §9, not forgotten.
