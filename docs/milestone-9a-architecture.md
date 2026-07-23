# Milestone 9A — Data Exchange Platform Foundation

**Status:** Complete. Scope: `js/services/dataExchange/` — a reusable, format-agnostic
architecture for import/export/backup/restore/migration. **No XML/CSV/Excel/JSON/ZIP code, no UI,
no database calls, and no business-rule changes** are part of this milestone. Every existing
module (companies/customers/suppliers/items/purchases/sales/manufacturing/stock/dashboard/
reports/search/shared components/shared services/shared validation/Design System) is untouched —
this milestone is 76 net-new files and zero modified files.

## Two conventions adapted from the spec's literal wording

- **Location:** `js/services/dataExchange/`, not a new top-level `services/` folder — the app has
  a single JS root (`js/`) today; a second root would be inconsistent with every existing file.
- **Contracts:** the spec's "interfaces" (`IDataParser`, `IExporter`, etc.) are factory functions +
  JSDoc `@typedef` + a runtime `assertValidX()` shape-checker — not ES6 classes. The codebase has
  zero classes anywhere (confirmed by grep); everything is factory functions returning plain
  objects. A `createBaseX(overrides)` per contract gives default no-op methods a future format
  implementation spreads in and overrides — composition over inheritance, matching the existing
  idiom exactly.

A mid-build instruction ("keep this lightweight, no speculative abstraction") trimmed the original
draft: `contract.js` + `baseX.js` were merged into one file per contract (6 folders), 4 near-
identical version wrapper files collapsed into one generic `version.js`, 4 near-identical history
wrapper files removed (`historyEntry.js` already takes `type` as a field), and `progressEvent.js`
merged into `progressTracker.js` (its only caller). Net effect: ~88 → 76 files, same coverage.

## Folder structure

```
js/services/dataExchange/
  index.js                    -- single top-level barrel
  dataExchange.test.html       -- architecture-level tests (43 checks)
  shared/                       -- cross-cutting infra (16 files)
    freezeDeep.js, severity.js, dependencyGraph.js, index.js
    errors/       dataExchangeError.js, errorCategory.js, errorCodes.js, errorCollector.js, index.js
    logging/      logger.js, consoleSink.js, memorySink.js, index.js
    version/      version.js, compatibility.js, index.js
  dto/                          -- format-independent data shapes (14 files)
    baseDTO.js, companyDTO.js, customerDTO.js, supplierDTO.js, itemDTO.js, purchaseDTO.js,
    saleDTO.js, manufacturingDTO.js, stockDTO.js, settingsDTO.js, metadataDTO.js,
    transactionDTO.js, historyDTO.js, index.js
  parsers/    contract.js, index.js            -- import-side format contract (2 files)
  exporters/  contract.js, index.js            -- export-side DB->DTO contract (2 files)
  formatters/ contract.js, index.js            -- export-side DTO->output contract (2 files)
  validators/                    -- the composable validation pipeline (12 files)
    validationResult.js, validationPipeline.js, index.js
    stages/  createStageValidator.js (shared runner), fileValidator.js, schemaValidator.js,
             businessValidator.js, relationshipValidator.js, referenceValidator.js,
             duplicateValidator.js, conflictValidator.js, index.js
  conflicts/  conflictActions.js, conflict.js, conflictEngine.js, index.js   (4 files)
  preview/    previewStatus.js, previewItem.js, previewModel.js, index.js   (4 files)
  transactions/ transactionState.js, transactionEngine.js, index.js         (3 files)
  progress/   progressTracker.js, index.js                                  (2 files)
  import/     importPlan.js, importerContract.js, index.js                  (3 files)
  export/     exportPlan.js, index.js                                       (2 files)
  backup/     backupTypes.js, backupContract.js, index.js                   (3 files, interfaces only)
  restore/    restoreContract.js, index.js                                  (2 files, interfaces only)
  history/    historyStatus.js, historyEntry.js, index.js                   (3 files)
```

## Module responsibilities

- **`shared/`** — infrastructure every other folder depends on: `deepFreeze` (single canonical
  immutability helper), `SEVERITY` (shared by errors + validation), `dependencyGraph` (generic
  topological sort + cycle detection, no entity names baked in), the **Error System**
  (`createDataExchangeError`, `ERROR_CATEGORY`, `ERROR_CODES`, `createErrorCollector` — structured
  errors, never raw strings, built to collect hundreds without throwing), **Logging**
  (`createLogger` with an injected sink — console or memory — never a hard `console.log`
  dependency), and the **Version Framework** (one generic `createVersion()` reused for app/schema/
  migration/backup versions, plus `compareVersions`/`isCompatible`).
- **`dto/`** — the format-independent layer every parser/exporter converts to/from. `createDTO`
  stamps `__dtoType` and deep-freezes; 12 entity factories per the spec (Company through History).
  `transactionDTO.js` (a generic single-record envelope) is explicitly distinguished in its own
  banner comment from `transactions/transactionEngine.js` (the execution orchestrator) — same
  word, two different concepts, kept from colliding.
- **`parsers/` / `exporters/` / `formatters/`** — the three format contracts (`IDataParser`,
  `IExporter`, `IFormatter`), each an `assertValidX()` runtime check + a `createBaseX()` default-
  stub factory. Zero format knowledge; these exist purely so 9B's XML parser (and future CSV/
  Excel/JSON ones) have something concrete to implement.
- **`validators/`** — `ValidationResult` (structured errors/warnings/information, deliberately a
  different shape from the Form Framework's field-level string-or-null validators — different
  problem, kept from colliding) + `ValidationPipeline` (runs stages in order, merges, optional
  halt-on-error) + the 7 named stages (File/Schema/Business/Relationship/Reference/Duplicate/
  Conflict), each a thin call into one shared `createStageValidator(name, {rules})` runner —
  avoids the same run-rules-and-merge logic being copy-pasted 7 times. Rules are injected
  (dependency injection); no entity- or format-specific rule is defined anywhere in this milestone.
- **`conflicts/`** — `CONFLICT_ACTIONS` enum, `createConflict`/`resolveConflict` (resolution is an
  immutable update — a new object, not a mutation), `createConflictEngine` (runs injected
  detectors; the engine itself knows nothing about any entity type).
- **`preview/`** — `PREVIEW_STATUS` enum, `createPreviewItem`, `createPreviewModel` (counts,
  filtering) — reusable by every future importer's review-before-import screen.
- **`transactions/`** — `createTransactionEngine`: a unit-of-work style orchestrator
  (`begin`/`registerRollbackStep`/`commit`/`rollback` running undo callbacks LIFO,
  `collectErrors`/`collectWarnings`/`getErrors`/`getWarnings`, `trackProgress`). No real DB
  transaction exists at this layer (no DB calls, per scope) — this is the contract a future
  Supabase-backed importer will drive.
- **`progress/`** — `createProgressTracker`: `update()`, `percentage()`, `elapsedMs()`,
  `estimatedRemainingMs()`, and a minimal `on()`/`off()` pub-sub for UI updates (no UI here).
- **`import/`** — `createImportPlan` (the blueprint: order, dependencies, validation state,
  conflict summary, estimated changes) + `IImporter` contract (`prepare`/`run`/`getResult`).
- **`export/`** — `createExportPlan`, deliberately simpler than `ImportPlan` — the spec's export
  diagram has no conflict/preview stage, so this folder doesn't invent one.
- **`backup/` / `restore/`** — interfaces only, per spec (`IBackupProvider`, `IRestoreProvider`),
  plus the `BACKUP_TYPES` enum. Zero implementation.
- **`history/`** — `HISTORY_STATUS` enum + one `createHistoryEntry({type, ...})` factory (import/
  export/backup/restore history are all the same shape, distinguished by `type` — no reason for
  four wrapper files), built on `dto/historyDTO.js`'s shape rather than duplicating it.

## Dependency graph among the folders themselves

```
shared/  (no internal deps — the base layer)
  ↑
dto/  →  depends on shared/ (freezeDeep)
  ↑
parsers/, exporters/, formatters/  →  depend on shared/errors (contract assertions)
  ↑
validators/  →  depends on shared/errors, shared/severity
conflicts/   →  depends on shared/freezeDeep
preview/     →  depends on shared/freezeDeep
  ↑
transactions/  →  depends on shared/errors
progress/      →  no internal deps (pure state + pub-sub)
  ↑
import/   →  depends on shared/errors; conceptually composes preview/ + conflicts/ + validators/
             + transactions/ + progress/ at the point a future importer wires them together
             (not imported directly by import/ itself — those are peer inputs an Importer receives)
export/   →  depends on shared/freezeDeep
backup/, restore/  →  depend on shared/errors
history/  →  depends on dto/historyDTO.js, history/historyStatus.js
  ↑
index.js  →  barrels every folder above into one public entry point
```

## Extension points for Milestone 9B (XML import)

A future XML parser must:
1. Implement `IDataParser` (`parsers/contract.js`): `validate(xmlSource)` returning a
   `ValidationResult`-shaped check, `parse(xmlSource)` returning `dto/*` objects, plus
   `getMetadata()`/`getWarnings()`/`getErrors()`. Compose `createBaseParser()` and override
   `validate`/`parse`.
2. Register whatever **validation rules** it needs into the 7 stage factories
   (`validators/stages/*`) — e.g. an XML schema-shape rule into `createSchemaValidator({rules})`.
3. Register **conflict detectors** (e.g. "item code already exists") into
   `createConflictEngine({detectors})`.
4. Build `dto/*` objects from parsed XML nodes using the existing 12 DTO factories — no new DTO
   shape should be needed for a first XML import unless a genuinely new business concept appears.
5. Implement `IImporter` (`import/importerContract.js`): `prepare()`, `run(plan, {transactionEngine,
   progressTracker})` driving `createTransactionEngine()` and `createProgressTracker()`, and
   `getResult()`.
6. Register real dependency edges into `createDependencyGraph()` for XML's entity order (the
   spec's Companies→Units→Item Groups→Items→Customers→Suppliers→Purchases→Sales→Manufacturing
   example) — nothing here is hardcoded, so 9B is free to define exactly the order XML needs.
7. Produce a `createImportPlan(...)` from the validated, conflict-resolved DTOs, then a
   `createPreviewModel(...)` for user review, before any importer runs.

A future XML **exporter** implements `IExporter` (DB → DTO) + a matching `IFormatter` (DTO → XML
string), and builds an `createExportPlan(...)`.

## Test coverage

`dataExchange.test.html` — **43/43 passing**, zero console errors, mirroring
`js/ui/forms/forms.test.html`'s exact convention (self-contained, `check()` helper, `document.title`
summary, `window.__DATA_EXCHANGE_TEST_RESULTS__`). Covers: DTO creation + frozen-object mutation
rejection, structured error creation + 250-entry collector aggregation, logger sink injection,
version comparison + compatibility, dependency graph ordering + cycle detection, validation
pipeline stage composition/merge/halt-on-error, conflict detection + immutable resolution, preview
aggregation/filtering, transaction commit vs. LIFO rollback, progress percentage math + event
firing, import plan generation, and history entry shape.

Regression: `forms.test.html` re-run — still **80/80 passing**. All 8 business-facing pages
(index/menu/items/suppliers/stock/sale/purchase/manufacturing) re-checked for console errors —
**zero** across all 8. `git diff --stat HEAD` shows zero modified files — only the new
`js/services/` tree and this report were added.

## Remaining work for 9B

- The actual XML parser/exporter/formatter implementations (this milestone is explicitly
  interfaces + orchestration only).
- Real validation rules and conflict detectors registered into the stage validators and conflict
  engine (currently `rules: []`/`detectors: []` by design — nothing entity-specific exists yet).
- A concrete `IImporter` that wires `TransactionEngine` to actual Supabase calls (`js/items.js`,
  `js/sales.js`, etc.) — this milestone deliberately stops at the orchestration contract, since no
  DB calls are in scope here.
- A settings/import UI screen (none exists yet, confirmed during pre-planning research).
- Real dependency-graph edges for whatever entity set XML import actually needs.

## Assumptions made

- The spec's dependency-order example (Companies→Units→Item Groups→Items→Customers→Suppliers→
  Purchases→Sales→Manufacturing) is illustrative of how a consumer would use
  `createDependencyGraph()`, not something to hardcode into the graph engine itself — "Units" and
  "Item Groups" aren't in the spec's DTO list and have no corresponding DTO in this milestone.
- `Customer`/`Supplier` are kept as two distinct DTOs even though the existing schema stores both
  as one `parties` table with a role column — the DTO layer models business concepts per the spec,
  not 1:1 storage mirrors.
- DTO field lists are representative, not exhaustive mirrors of every existing DB column — 9B's
  actual XML field mapping will refine them as real data shows up.
