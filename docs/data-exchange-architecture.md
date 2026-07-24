# Data Exchange Platform — Architecture Reference

This is the permanent architectural reference for `js/services/dataExchange/`, written
for whoever maintains or extends this platform next. It describes the system **as it
stands today**, organized by concept, not by milestone. It does not repeat the history,
rationale, or verification detail already recorded in the per-milestone reports —
consult those when you need the "why" behind a specific decision:

- `docs/milestone-9a-architecture.md` — platform foundation (contracts, DTOs, shared infra)
- `docs/milestone-9b-xml-mapping.md`, `docs/milestone-9b-import-report.md` — XML import
- `docs/milestone-9c-export-report.md` — XML export (also contains a cross-milestone audit)
- `docs/milestone-9d-backup-report.md` — native `.apnabill` backup
- `docs/milestone-9e-restore-report.md` — native `.apnabill` restore ("New Company Restore")

## 1. What this platform is

The Data Exchange Platform is ApnaBill's infrastructure for moving business data into and
out of the app, in whatever format and direction a given feature needs:

- **XML import/export** — Tally-dialect XML, both directions (built).
- **Native backup/restore** — the `.apnabill` format, a ZIP of per-table JSON (built,
  restore limited to "New Company Restore").
- **CSV/Excel/JSON import/export, cloud backup destinations, sync** — designed for, not
  yet built (§14, §16).

It lives entirely under `js/services/dataExchange/`, touches no existing business module
except through the same real functions those modules already expose (`createItem`,
`saveSaleFromCart`, etc.), and adds no schema changes beyond a small number of additive,
security-definer RPCs (`backup_rpc.sql`, `restore_rpc.sql`, alongside the app's existing
`*_rpc.sql` files).

## 2. Overall architecture

Every direction of data flow in this platform is a variation of one shape:

```
        IMPORT direction:  Source  -> Parser -> Mapper -> DTO -> Validate -> Conflict -> Preview -> Importer -> DB
        EXPORT direction:  DB -> Exporter -> DTO -> Validate -> Formatter -> Writer -> Output
        BACKUP direction:  DB (via one RPC) -> Provider -> Formatter -> Writer -> Destination
        RESTORE direction: Archive -> Reader -> Parser -> Provider -> (validate) -> RPC -> DB
```

Four layers recur across all of them, from most generic to most specific:

1. **Shared infrastructure** (`shared/`) — has no concept of "import" or "backup" at all:
   errors, logging, versioning, immutability, generic graph/pipeline utilities.
2. **Format-neutral contracts + models** (`dto/`, `parsers/`, `exporters/`, `formatters/`,
   `backup/`, `restore/`, `validators/`, `conflicts/`, `preview/`, `transactions/`,
   `progress/`, `import/`, `export/`, `history/`) — define *shapes* (DTOs, contracts,
   pipelines) with zero knowledge of Tally, ZIP, or any other concrete format.
3. **Concrete format engines** (`xml/`, `apnabill/`) — implement those contracts for one
   specific format. This is the only layer that knows what a `STOCKITEM` tag or a
   `manifest.json` file is.
4. **Orchestration functions** (`xmlImporter.js`'s `createXmlImporter()`/
   `buildXmlImportPlan()`, `xmlExporter.js`'s `runXmlExport()`, `apnabillBackup.js`'s
   `runApnaBillBackup()`, `apnabillRestore.js`'s `runApnaBillRestore()`) — the only code
   that wires a concrete engine's pieces together into one callable pipeline. These
   introduce **no new business rules** of their own; they sequence calls to layers 2 and 3.

## 3. Module map and dependency direction

```
shared/            <- no internal deps (the base layer)
  errors/, logging/, version/, freezeDeep.js, severity.js, dependencyGraph.js
  ↑
dto/               <- shared/freezeDeep
  ↑
parsers/, exporters/, formatters/     <- shared/errors (contract assertions only)
backup/, restore/                     <- shared/errors
  ↑
validators/        <- shared/errors, shared/severity
conflicts/         <- shared/freezeDeep
preview/           <- shared/freezeDeep
  ↑
transactions/      <- shared/errors
progress/          <- no internal deps (pure state + pub-sub)
history/           <- dto/historyDTO.js, its own historyStatus.js
  ↑
import/, export/   <- shared/freezeDeep; conceptually compose validators/conflicts/
                       preview/transactions/progress at the point a real importer/
                       exporter wires them together (never imported by import/export/
                       themselves — those are peer inputs a concrete engine receives)
  ↑
xml/               <- imports parsers/exporters/formatters/validators/conflicts/
                       preview/import/export/progress/history/shared, plus the real
                       app modules (js/items.js, js/sales.js, js/suppliers.js,
                       js/supabaseClient.js) — always via dynamic import()
apnabill/          <- imports formatters/(implicitly, via its own IFormatter impl)/
                       validators/preview/progress/history/shared, backup/'s and
                       restore/'s contracts, and js/supabaseClient.js — always via
                       dynamic import()
backup/destinations/  <- format-agnostic; used by apnabill/ but knows nothing about it
  ↑
services/dataExchange/index.js   <- barrels every folder above EXCEPT xml/ and apnabill/
```

**Why `xml/` and `apnabill/` aren't in the top-level barrel:** each is a complete,
self-contained format engine with its own barrel (`xml/index.js`, `apnabill/index.js`). A
future settings screen imports directly from the one it needs, rather than pulling both
Tally-XML and `.apnabill` machinery into scope through one omnibus import. `xml/index.js`
itself was never added to `services/dataExchange/index.js` either — `apnabill/index.js`
simply follows the precedent already set.

### Folder-by-folder reference

| Folder | Owns |
|---|---|
| `shared/` | Errors, logging, versioning, deep-freeze, severity levels, generic dependency graph |
| `dto/` | 12 format-independent entity shapes (Company, Item, Customer, Supplier, Sale, Purchase, Manufacturing, Stock, Settings, Metadata, Transaction, History) |
| `parsers/` | `IDataParser` contract (import-side: source → DTOs) |
| `exporters/` | `IExporter` contract (export-side: DB → DTOs) |
| `formatters/` | `IFormatter` contract (export-side: DTOs → output) |
| `validators/` | `ValidationResult`, `ValidationPipeline`, 7 named stage validators |
| `conflicts/` | `CONFLICT_ACTIONS`, `createConflict`/`resolveConflict`, `createConflictEngine` |
| `preview/` | `PREVIEW_STATUS`, `createPreviewItem`, `createPreviewModel` |
| `transactions/` | `createTransactionEngine` — unit-of-work commit/LIFO-rollback |
| `progress/` | `createProgressTracker` — state + pub-sub, no UI |
| `import/` | `createImportPlan`, `IImporter` contract |
| `export/` | `createExportPlan` |
| `backup/` | `BACKUP_TYPES`, `IBackupProvider`, `IBackupDestination` contracts, `destinations/` (concrete, format-agnostic destinations) |
| `restore/` | `IRestoreProvider` contract |
| `history/` | `HISTORY_STATUS`, one `createHistoryEntry({type, ...})` factory for every pipeline |
| `xml/` | The Tally-XML format engine (import + export), §6/§7 |
| `apnabill/` | The `.apnabill` native format engine (backup + restore), §4/§5 |

## 4. Backup flow

```
generate_company_backup_snapshot()  ->  apnabillBackupProvider.backup()  ->  apnabillArchiveFormatterV1.format()  ->  zipWriter.buildZip()
   (backup_rpc.sql, one REPEATABLE       (dynamic import of supabaseClient.js;   (manifest.json + one JSON file          (generic ZIP/STORE,
    READ transaction, §9)                 IBackupProvider.backup())              per table; the only file that           CRC-32'd via crc32.js)
                                                                                  knows table names)
                                                                                        |
                                                                                        v
                                                                              apnabillBackupProvider.verify()
                                                                              (zipReader.js CRC-verifies every
                                                                               entry + cross-checks manifest/
                                                                               snapshot table completeness)
                                                                                        |
                                                                                        v
                                                            localDiskBackupDestination.upload()  <-  runApnaBillBackup() orchestration
                                                            (Blob -> <a download> -> browser)         (provider + destination injectable)
```

- **Consistency (Tier 1, built):** the RPC sets `REPEATABLE READ` as its first statement,
  reads all 21 company-scoped tables inside that one snapshot, and logs one `audit_log`
  row in the same transaction — never a torn read across concurrently-committed writes.
  **Tier 2 (documented, not built):** a staging-table materialization fallback if Tier 1
  is ever rejected by this Supabase project; see the 9D report §4 for the full design.
- **Format:** ZIP with the STORE method only (no compression library exists in this
  codebase); `manifest.json` (format version, companyId, generatedAt, file list) plus one
  JSON file per table, deliberately never fabricating a value — a `null`/missing table is
  written as the literal JSON `null`, never an empty array.
- **Provider is fail-safe:** `verify()` runs before any destination ever sees the bytes;
  it re-parses the ZIP's actual central directory (not a signature-byte check) and
  cross-checks the table list.
- **Destination is pluggable:** `IBackupDestination` only ever sees a `Blob` — it has no
  idea what format produced it. `localDiskBackupDestination.js` is the only
  implementation today (browser download); a cloud destination is a drop-in future
  addition (§14).

## 5. Restore flow

```
.apnabill bytes  ->  apnabillArchiveParserV1.parseBackupArchive()  ->  apnabillRestoreProvider
                      (zipReader.js, CRC-verified; inverse of         .validateVersion() + .validateSchema()
                       the 9D formatter)                             .preview()  (row counts per table, offline)
                                                                              |
                                                                              v  (only if valid)
                                                                      .restore({companyId, manifest, snapshot})
                                                                              |
                                                                              v
                                                        restore_company_from_snapshot()  (restore_rpc.sql)
                                                        1. verify 17 tables are empty for companyId, or abort
                                                        2. wipe + replace firms/payment_types/invoice_prefixes
                                                        3. insert all business tables, company_id remapped
                                                        4. insert audit_log history + one new restore-event row
                                                        5. UPDATE companies row (name/fy/loyalty fields only)
```

- **Scope: "New Company Restore" only.** The target company must already have zero rows
  in every genuinely transactional table (17 of 21 — the other 4 are `companies` itself,
  plus `firms`/`payment_types`/`invoice_prefixes`, which `create_company()` always seeds
  and which restore safely wipes and replaces since nothing yet references them). **No
  merge, no partial restore, no restore into a company that already has data.**
  "Disaster Recovery Restore" (full replacement of an existing company) is a deliberately
  separate, higher-blast-radius mode that does not exist yet — see §16.
- **Fail-safe by construction:** `restore()` re-validates before doing anything, even if a
  caller already ran `validateVersion()`/`validateSchema()` — calling it directly is
  exactly as safe as going through the orchestration layer.
- **Atomicity:** entirely Postgres's own — `restore_company_from_snapshot()` is one
  plpgsql function body, one transaction; any exception unwinds every write it already
  made. Neither the provider nor the orchestration layer adds any transaction logic.
- **`rollback()` is a documented no-op** for this mode: by the time `restore()` settles
  (resolved or thrown), the RPC's own transaction has already fully committed or fully
  rolled back — there is nothing left open at the JS layer to undo.
- **Row identity is preserved, never regenerated.** Every table's original primary keys
  and cross-table foreign keys travel through unchanged; only each row's `company_id` is
  rewritten to the restore target. This is what keeps the restored data's internal
  references self-consistent without needing to rebuild them.

## 6. XML import flow (Tally dialect)

```
buildXmlImportPlan(xmlSource, opts)
  parse (tallyXmlParser)  ->  map (itemMapper/partyMapper/companyMapper/voucherDispatcher)
  ->  DTOs  ->  validate (businessValidator + referenceValidator via xmlBusinessRules)
  ->  detect conflicts (conflictEngine + xmlConflictDetectors)
  ->  classify (previewModel: NEW/EXISTING/DUPLICATE/INVALID)
  ->  order (dependencyGraph: company -> item/customer/supplier -> sale)
  ->  ImportPlan (never writes anything -- this is the confirmation gate)

createXmlImporter()  -- IImporter
  prepare()  ->  run(plan, {transactionEngine, progressTracker})
  ->  drives already-existing real writers (createItem, createPartyQuick, createSupplier,
      saveSaleFromCart) + two NEW writers (openingBalanceWriter, openingStockWriter)
  ->  each write registers an undo step; any failure triggers LIFO rollback
  ->  getResult()
```

Nothing here is new business logic — every entity write reuses the app's own existing,
already-tested functions. The only genuinely new writes are the two opening-
balance/opening-stock RPC-calling writers, because nothing in the app previously needed
to set those from an external source. `groupClassifier.js` derives customer-vs-supplier
role from Tally's `PARENT` string, since XML doesn't carry ApnaBill's own
`is_customer`/`is_supplier` flags directly.

## 7. XML export flow (Tally dialect)

```
buildXmlExportPlan(opts)
  read (dataReaders: fetchAllItems/fetchAllParties/fetchOpeningStockForItem/fetchSalesInvoices)
  ->  map (itemExportMapper/partyExportMapper/companyExportMapper/salesVoucherExportMapper)
  ->  DTOs  ->  validate (reused xmlBusinessRules + one new duplicateNameWithinBatchRule)

createXmlExporter()  -- IExporter, produces DTOs only, never calls a formatter itself
runXmlExport()  -- orchestration: Exporter -> Formatter -> Output
  ->  tallyXmlFormatterV1.format()  (owns every Tally structural decision: ENVELOPE/
      TALLYMESSAGE/.LIST convention, GST-rate splitting, GROUP/UNIT/CURRENCY scaffolding)
  ->  tallyXmlWriter.serialize()  (pure tree -> escaped, indented XML text, zero Tally knowledge)
  ->  download.js's downloadXmlFile()  -- NOT called by runXmlExport() itself; left for a
      future UI screen to call explicitly
```

Note the one deliberate asymmetry with the backup flow (§4): `runXmlExport()` stops at
producing formatted text, while `runApnaBillBackup()` calls `destination.upload()` itself.
A backup's entire purpose is reaching a destination; an export's isn't necessarily a
download every time, so that decision is left one layer up, to whichever UI eventually
calls it.

## 8. Shared infrastructure

- **Errors** (`shared/errors/`) — `createDataExchangeError({message, code, severity,
  category, entity, field, suggestion, source})`, a single structured shape used
  everywhere instead of raw thrown strings; `ERROR_CODES`/`ERROR_CATEGORY` are small,
  generic starter registries any format is free to extend or supplement;
  `createErrorCollector()` aggregates hundreds of entries without ever throwing.
- **Logging** (`shared/logging/`) — `createLogger({sink})`; sink is injected (console by
  default, memory for tests), so nothing in this platform ever calls `console.log`
  directly.
- **Versioning** (`shared/version/`) — one generic `createVersion({major,minor,patch,label})`
  reused for every kind of version this platform tracks (app, schema, migration, backup
  format), plus `formatVersion`/`parseVersion` (string ↔ object) and
  `compareVersions`/`isCompatible` (semver-style comparison). See §13.
- **`deepFreeze`** — the single canonical immutability helper; every DTO, every enum,
  every contract's frozen default object goes through it.
- **`SEVERITY`** — one scale (`info`/`warning`/`error`/`critical`) shared by the error
  system and the validation pipeline, so there's exactly one severity concept in the
  platform, not two that could drift apart.
- **`createDependencyGraph()`** — generic topological sort + cycle detection, no entity
  names baked in. Currently has exactly one real consumer (`xmlImporter.js`'s fixed
  `company → item/customer/supplier → sale` order) — a fixed array would do the same job
  today; keep this for a future format whose entity order is genuinely data-dependent,
  not because "it exists, so use it."

## 9. Validation pipeline

`createValidationResult({errors, warnings, information})` is the one result shape every
validation-producing function in this platform returns: `isValid()`, `merge(other)`
(concatenates all three lists), `toSummary()`. Deliberately distinct from
`js/ui/forms`' field-level string-or-null validator shape — different problem (aggregate,
batch, hundreds-of-records vs. single live input), kept from colliding.

`createValidationPipeline(stages, {haltOnError})` runs an ordered list of `{name,
validate()}` stages against a DTO list, merging results; `haltOnError` stops at the first
stage that fails, otherwise every stage always runs so a caller sees every problem in one
pass, not just the first.

Seven named stages (`validators/stages/`) — File, Schema, Business, Relationship,
Reference, Duplicate, Conflict — each a thin call into one shared
`createStageValidator(name, {rules})` runner, so the run-rules-and-merge logic isn't
copy-pasted seven times. **Rules are always injected**, never hardcoded into a stage:
`xmlBusinessRules.js`/`xmlExportRules.js` supply the Tally-specific rules; `.apnabill`
has none of its own (its equivalent checks — table completeness, version compatibility —
live directly in `apnabillBackupProvider.js`/`apnabillRestoreProvider.js` rather than as
injected pipeline rules, since they're closer to "does this look like the right kind of
archive" than "does this record satisfy a business rule").

## 10. History pipeline

One factory, `createHistoryEntry({type, timestamp, durationMs, recordCount, warnings,
errors, status, user, version})`, used for every kind of history this platform ever
records — `type` distinguishes `'import'`/`'export'`/`'backup'`/`'restore'`, avoiding four
near-identical wrapper files. Adds `isSuccess()` (checks `status === HISTORY_STATUS.SUCCESS`)
on top of `dto/historyDTO.js`'s plain shape. `HISTORY_STATUS` is `PENDING`/`SUCCESS`/
`PARTIAL`/`FAILED` — no `CANCELLED` value exists yet (§16 notes this as a real gap for
restore's cancellation hook).

## 11. Progress pipeline

`createProgressTracker()` — `update(partial)`, `percentage()`, `elapsedMs()`,
`estimatedRemainingMs()`, and a minimal `on()`/`off()` pub-sub, entirely UI-independent.
Used at different granularities depending on the pipeline's actual shape:

- **Single-shot** (backup): one `update()` call at the end, `totalRecords: 1`.
- **Stage-based** (restore orchestration): `totalRecords` = number of named pipeline
  stages (parse/validate/preview/restore), advanced one stage at a time — coarse but
  real, a future UI can subscribe via `on()` to show "validating…", "restoring…", etc.
- **Batched yielding** (XML formatter): not this tracker at all — `tallyXmlFormatterV1.js`
  calls `await Promise.resolve()` every 200 records so a large export doesn't block the
  event loop; that's a scheduling concern, orthogonal to progress *reporting*.

## 12. Versioning

`shared/version/` is the one place "what version is this" is ever computed, for two
distinct purposes that share the same machinery:

- **Format versioning**: each concrete formatter exposes `getFormatVersion()` — a
  `createVersion()` value, formatted into the archive/output itself (Tally XML has no
  such stamp; `.apnabill`'s `manifest.json` carries `formatVersion:
  "1.0.0-apnabill-archive"`, produced by `formatVersion(getFormatVersion())`).
- **Restore-time compatibility**: `apnabillRestoreProvider.js`'s `validateVersion()`
  parses that string back (`parseVersion`) and checks it against the one version this
  restore engine understands, using `compareVersions`/`isCompatible`: a different major
  version is rejected outright, an older-than-minimum version is rejected, a newer
  minor/patch produces a warning (forward-tolerant, not a hard failure) — because only one
  version has ever existed, this logic is written but not yet exercised against a
  genuinely different real archive.

## 13. Extension points

**A new export format** (CSV/Excel/JSON): implement `IExporter` (DB → DTOs, reusing the
existing `dto/*` factories wherever the format's data maps onto them) and a matching
`IFormatter` (DTOs → output), plus a pure writer if the format needs one. Wire them
together with a new `run<Format>Export()` orchestration function, mirroring
`runXmlExport()`. No change to `exporters/contract.js`/`formatters/contract.js` should be
necessary — they're already format-agnostic.

**A new import format**: implement `IDataParser`, register whatever new validation rules
and conflict detectors the format needs into the existing 7 stage validators and
`createConflictEngine`, build `dto/*` objects from the parsed source, implement
`IImporter`, and register real dependency-graph edges only if the format's entity order
is genuinely data-dependent (§8's note on `createDependencyGraph()`).

**A new backup destination** (cloud storage): implement `IBackupDestination`'s `upload`
(required) and optionally `download`/`list`/`delete` — a `Blob` in, a
`{location, uploadedAt}` out. Inject it via `runApnaBillBackup({destination})`; zero
changes needed to the provider or orchestration layer. This is exactly what the
destination contract's pluggability was built for (§16).

**Disaster Recovery Restore**: a new RPC (not a modification of
`restore_company_from_snapshot()`, which is deliberately "New Company Restore" only) that
wipes an *existing*, non-empty company's data before restoring — needs its own explicit
confirmation flow at the UI layer before it should exist at all, given the blast radius
(§16).

**A new archive format entirely** (if `.apnabill`'s ZIP+JSON shape is ever replaced):
implement a new formatter/parser pair under a new format folder (mirroring `apnabill/`'s
own split from `xml/`), reusing `backup/backupContract.js`/`restore/restoreContract.js`
unchanged — those contracts have no ZIP/JSON knowledge baked into them.

## 14. Design principles

These recur across every milestone this platform has gone through; treat them as the
platform's actual style guide, not just incidental patterns:

1. **Contract-first, factory functions, not classes.** Every contract is
   `assertValidX(candidate)` (a runtime shape check) + `createBaseX(overrides)` (a
   default-stub factory), never an ES6 class or interface. The codebase has zero classes
   anywhere; composition over inheritance throughout.
2. **Three-layer split per format: primitive → format-aware → business-aware.** A
   `zipWriter.js`/`tallyXmlWriter.js` knows nothing but its container format; a
   `apnabillArchiveFormatterV1.js`/`tallyXmlFormatterV1.js` knows the format's
   structural conventions (table names, tag names) but no ApnaBill business rules beyond
   that; a mapper/provider knows the actual business data. Never collapse these into one
   file even when it would be shorter.
3. **Dynamic imports for anything that touches the network.** Every reader/writer that
   calls Supabase imports `supabaseClient.js` (and, transitively, the app's other
   business modules) via `await import(...)`, never at module top level — so merely
   *importing* any part of this platform, including every offline test harness, never
   requires network access. Only actually *calling* the function does.
4. **Never infer or fabricate data.** A missing table, a missing field, a missing file is
   always reported as an error naming what's missing — never silently defaulted, zeroed,
   or recreated. Verified directly at multiple layers: the backup formatter writes `null`
   rather than `[]` for an absent table; the restore parser leaves a key genuinely absent
   from its snapshot object rather than inventing one; `validateSchema()` reports the gap
   rather than papering over it.
5. **Fail-safe before any write.** Every write-capable operation (restore's `restore()`,
   backup's `verify()` gate before upload) validates first and refuses to proceed on
   failure — checked directly, not just designed that way: a spy in place of the real RPC
   confirms it is never called when validation fails.
6. **Atomicity lives in exactly one place per operation: a single RPC call.** Neither the
   provider nor the orchestration layer implements its own transaction/rollback logic for
   backup or restore — Postgres's own plpgsql semantics (one function body = one
   transaction) already guarantee all-or-nothing. (XML import is the one pipeline that
   *does* need its own `transactions/transactionEngine.js`, because it drives many
   independent existing write functions rather than one RPC.)
7. **Deep immutability by default.** Every DTO, every enum (`BACKUP_TYPES`,
   `HISTORY_STATUS`, `PREVIEW_STATUS`, `ERROR_CODES`, `ERROR_CATEGORY`, `SEVERITY`), every
   contract's default object is `deepFreeze`d.
8. **Dependency injection for offline testability.** `provider`, `destination`,
   `formatter`, `exporter`, and even the raw `rpc` function itself are all injectable with
   real defaults, specifically so every orchestration function and every provider method
   can be exercised by a test harness with a fake in place of anything that would
   otherwise require a live database or trigger a real browser side effect.
9. **Structured errors, never raw strings.** Every thrown/collected error is a
   `createDataExchangeError()`-shaped object; error-normalization logic (§ restore
   orchestration) specifically checks for and preserves that shape rather than
   double-wrapping it.
10. **One offline, headless-runnable test harness per format engine.** Each engine
    (`dataExchange.test.html`, `xmlImport.test.html`, `xmlExport.test.html`,
    `apnabill.test.html`, `apnabillRestore.test.html`) is a flat, dependency-free HTML
    page, runnable via `python -m http.server` + `chrome --headless`, with zero build
    step. When a real dependency (a live database, a real browser download) can't be
    exercised offline, that limitation is stated directly in the harness's own header
    comment — never silently skipped without a trace.
11. **Documented limitations over hidden ones.** Every report in this platform states
    plainly what was *not* verified (almost always: real Supabase RPC execution, since no
    credentials are reachable in this environment) rather than implying broader coverage
    than actually exists.

## 15. Where "New Company Restore" fits vs. what restore does NOT do

Worth stating plainly in one place, since it's the platform's highest-blast-radius
capability: `restore_company_from_snapshot()` **only** ever restores into a company that
already has zero rows in every transactional table. It never merges, never resolves
conflicts, and never touches a company that has any existing business history. Anyone
extending this platform toward a "restore on top of existing data" or "roll a company
back to an earlier backup" feature is building a **new, separate** capability (§16), not
modifying this one.

## 16. Future milestones

Nothing below is designed in detail — this section exists so a future maintainer knows
these directions were anticipated, not that they're specified:

- **9F and beyond, generally**: whichever format or feature comes next should follow the
  same contract-first, three-layer pattern (§14.2) and get its own dedicated offline test
  harness (§14.10) before being considered done, matching every engine built so far.
- **Cloud Backup**: `BACKUP_TYPES.CLOUD` (defined in 9A's enum) has no implementation yet.
  The extension point already exists (§13) — a Supabase Storage (or Drive/Dropbox/S3)
  destination implementing `IBackupDestination`, injected into `runApnaBillBackup()` with
  zero changes to the provider or orchestration layer.
- **Incremental Backup**: `BACKUP_TYPES.INCREMENTAL` (also defined in 9A's enum, also
  unimplemented) — would need a way to express "changed since backup N," which
  `generate_company_backup_snapshot()` does not currently support (it always reads
  everything).
- **Disaster Recovery Restore**: full replacement of an existing company (§13, §15) —
  explicitly deferred during 9E's design review because of its blast radius; needs its
  own RPC and its own explicit, separately-designed confirmation flow.
- **Sync**: bidirectional reconciliation between two write locations (e.g. offline-first
  local state and Supabase) is a materially different problem from any pipeline this
  platform currently has — none of import/export/backup/restore assume more than one
  location can independently mutate the same data concurrently. `conflicts/conflictEngine.js`
  is the closest existing building block (detector-based, format-agnostic conflict
  detection) but was designed for "does this incoming record collide with an existing
  one," not "which of two divergent histories wins." Treat sync as needing genuinely new
  infrastructure, not an extension of the conflict engine as it exists today.
- **A restore engine for formats beyond `.apnabill`**: if XML import (§6) is ever asked to
  support "restore my whole company from an XML export" rather than incremental
  import-on-top, that's a new capability layered on `xml/`'s existing pieces, not a
  change to `restore/restoreContract.js` (which is already format-agnostic).
