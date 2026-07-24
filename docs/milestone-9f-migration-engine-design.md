# Milestone 9F — Migration Engine: Architecture Design

**Status: design only. No production code, no schema changes, no API changes, no file
renames. Nothing in this document has been implemented.** This is a proposal for review,
built by studying Milestones 9A–9E (`data-exchange-v1.0`, tagged and merged into `master`)
as they actually exist today — every claim below was checked directly against the current
source under `js/services/dataExchange/` (the codebase's actual path; this milestone's
brief referenced `src/dataExchange/`, which does not exist in this repository) and the
five prior milestone reports plus `docs/data-exchange-architecture.md`.

## 1. Goals

Design a **Migration Engine** — a single, reusable orchestration layer that every current
and future data-movement pipeline (Backup, Restore, XML Import, XML Export, and later CSV/
JSON/ERP integrations) can run on top of, so that:

- Planning, validation sequencing, dependency ordering, conflict resolution, progress
  reporting, execution, verification, reporting, rollback, error normalization, and batch
  execution are each implemented **once**, correctly, instead of once per format.
- Adapters (the format-specific pieces — parsers, formatters, providers, writers) shrink to
  "how do I read data" and "how do I write data," nothing else.
- A brand-new format (CSV import, say) can be added by writing an adapter and a handful of
  declarative rules — **not** by writing a new orchestration function that re-derives the
  same sequencing logic a fifth time.
- Nothing built in 9A–9E breaks. This is evolution, not a rewrite — 9A–9E is explicitly
  "production-ready," not a draft to redo.

## 2. Current architecture (as it exists today)

Four orchestration functions exist, one per pipeline, each independently implementing the
same conceptual sequence:

| Pipeline | Orchestration function | Source | Sink |
|---|---|---|---|
| XML Import | `buildXmlImportPlan()` + `createXmlImporter().run()` | `xml/xmlImporter.js` | Real business writers (`createItem`, `createPartyQuick`, `createSupplier`, `saveSaleFromCart`) |
| XML Export | `runXmlExport()` | `xml/export/xmlExporter.js` | Formatted text (caller downloads separately) |
| Backup | `runApnaBillBackup()` | `apnabill/apnabillBackup.js` | `localDiskBackupDestination` |
| Restore | `runApnaBillRestore()` | `apnabill/apnabillRestore.js` | `restore_company_from_snapshot()` RPC |

Each already follows the same conceptual shape (`docs/data-exchange-architecture.md` §2
documents this): `Source → (map to DTO) → Validate → (Conflict) → (Preview) → Execute →
(Verify) → Report`. The shared, format-agnostic building blocks these four already reuse
are real and well-built:

- `validators/` — `ValidationPipeline` + 7 stage validators, rules injected.
- `conflicts/conflictEngine.js` — detector-injected conflict detection.
- `preview/` — `PreviewModel`/`PreviewItem`, status-classified.
- `shared/dependencyGraph.js` — generic topological sort.
- `transactions/transactionEngine.js` — unit-of-work commit/LIFO-rollback.
- `progress/progressTracker.js` — state + pub-sub.
- `history/historyEntry.js` — one factory, `type`-discriminated.
- `shared/errors/`, `shared/version/` — structured errors, version comparison.

**What does not exist today is a shared orchestrator.** Each of the four functions above
independently *calls* these shared pieces, in its own hand-written sequence, with its own
hand-written glue in between. That glue is where the duplication and drift live (§3).

## 3. Problems (evidence, not assumption)

Every item below was confirmed by direct, line-level comparison of the four orchestration
functions' actual current source, not inferred from their reports.

### 3.1 The validation-gate timing is different in all four pipelines

- **XML Import**: `createXmlImporter().run()` does **not** check `validationResult.isValid()`
  at all. It executes `resolvedDtos` unconditionally. The gate is entirely the caller's
  responsibility — nothing in `xmlImporter.js` itself enforces it. (Confirmed: no
  `isValid()` call anywhere in `run()`.)
- **XML Export**: `runXmlExport()` checks `plan.validationResult.isValid()` **before**
  calling the formatter — a pre-execution gate.
- **Backup**: `apnabillBackupProvider.verify()` runs **after** `backup()` has already
  produced bytes — a post-execution gate. `runApnaBillBackup()` then gates the
  *destination upload* (not the backup itself) on that result.
- **Restore**: `apnabillRestoreProvider.restore()` re-validates **before** doing anything,
  every time, regardless of whether a caller already checked — the strictest of the four,
  explicitly documented as "fail-safe by construction."

Four different answers to "when does validation actually block something," for what is
conceptually one question asked four times.

### 3.2 Progress reporting has four different granularities

- **Import**: genuine per-record streaming (`currentRecord++` inside the write loop) — the
  only pipeline with real incremental progress.
- **Export**: one coarse snapshot at the end (`currentRecord: dtos.length`), despite
  iterating per-DTO internally during formatting.
- **Backup**: one coarse snapshot (`totalRecords: 1`) — a single-shot operation reported
  as if it were one record.
- **Restore**: stage-based (4 named stages: parse/validate/preview/restore), coarser than
  import, finer than backup.

A future UI subscribing to `progressTracker.on()` gets a materially different experience
depending on which pipeline it's watching, for no reason rooted in the operations
themselves — restore genuinely *could* report per-table progress (it iterates tables
internally) but doesn't.

### 3.3 Error normalization exists in exactly one of four pipelines

Only `runApnaBillRestore()` wraps every stage in a way that guarantees a thrown value
becomes a normalized entry on the returned result rather than an unhandled rejection —
this was a **deliberate, explicitly-documented deviation** from `runApnaBillBackup()`'s own
pattern, recorded in `docs/milestone-9e-restore-report.md` §2 ("differs from
`runApnaBillBackup()`... that function lets a provider's exception propagate up
uncaught"). Import and Export inherit backup's un-normalized behavior. This means the same
class of failure (a thrown error mid-pipeline) is handled three different ways depending
on which of the four pipelines you're in.

### 3.4 History-entry construction and status derivation are copy-pasted four times

Every orchestration function independently writes the same two-line pattern
(`const startedAt = Date.now(); ... durationMs: Date.now() - startedAt`) and independently
derives its own `status: SUCCESS/FAILED` ternary and its own `recordCount` computation
(`resolvedDtos.length` / `dtos.length` / `totalRowCount(summary.tableCounts)` / a sum over
`previewModel.items`). Four independent, slightly-different implementations of "did this
run succeed, and how many records did it touch" — a natural single source of truth that
doesn't exist yet.

### 3.5 The same 21/17/3/1-table entity list exists as six independent copies

`apnabillArchiveFormatterV1.js`, `apnabillArchiveParserV1.js`, `apnabillBackupProvider.js`,
`apnabillRestoreProvider.js`, `restore_rpc.sql`, and both `.apnabill` test harnesses each
carry their own literal copy of the same table list (or a documented subset of it). Every
one of these files' own comments already acknowledge this is deliberate ("kept as its own
copy... so drift can be caught") — a pragmatic choice under 9D/9E's actual constraints, but
a textbook case for a single canonical entity manifest once a shared engine exists to own
one.

### 3.6 "Plan" objects are built inconsistently — or not at all

`xmlImporter.js` builds a real `createImportPlan()`. `xmlExporter.js` **never calls**
`createExportPlan()` at all — confirmed directly, and already flagged in 9C's own
architecture audit (`docs/milestone-9c-export-report.md` §12.3): it builds an ad hoc
`{kind, companyDto, items, parties, sales, validationResult, exportModel}` shape instead.
Backup and Restore have no "plan" concept whatsoever — just an options object passed
straight through. Three different answers to "what does this operation intend to do,
before it does it."

### 3.7 Rollback strategy is hardcoded per-pipeline, not a shared abstraction

Three genuinely different mechanisms exist, each hand-built inside its own orchestration
function: import's `transactionEngine.js` (LIFO undo callbacks, because it drives many
independent existing write functions with no shared DB transaction); restore's "delegate
entirely to one Postgres transaction, `rollback()` is a documented no-op"; backup's "there
is nothing to roll back" (read-only). These are legitimately different strategies for
legitimately different operation shapes — but nothing today expresses "rollback strategy"
as a pluggable concept an adapter declares; each orchestration function simply *is* its
one strategy.

### 3.8 Cancellation exists in exactly one of four pipelines

Only `runApnaBillRestore()` accepts an `opts.signal` and checks it at stage boundaries —
explicitly scoped as "a hook for future use," per its own report. The other three
pipelines have no cancellation concept at all.

## 4. Key design questions answered

Direct, short answers; the sections that follow (§6 onward) give the full reasoning.

1. **What problems exist today?** §3, above — four independently-implemented
   orchestration functions with inconsistent validation-gate timing, progress
   granularity, error normalization, history/status derivation, plan construction, and
   rollback strategy, plus a 6-times-duplicated entity table list.
2. **Which orchestration logic is duplicated?** The `startedAt`/`durationMs`/history-entry
   pattern (4×), the entity table list (6×), the "iterate planned units, track progress,
   handle failure" batch-execution loop (4×, each independently shaped).
3. **Which responsibilities should move into the Migration Engine?** Plan construction,
   validation-pipeline invocation timing, dependency ordering invocation, conflict-engine
   invocation, progress reporting, history-entry generation, error normalization, the
   batch-execution loop itself, and rollback-strategy selection. See §6, §9–§15.
4. **Which responsibilities should remain inside adapters?** Actual parsing/formatting/
   serialization, actual DB reads/writes, business-specific validation rules and conflict
   detectors (injected as data, not moved), business-specific mapping, and any
   domain-specific precondition logic (e.g. restore's "must be empty" check). See §10.
5. **How should Backup migrate?** §16 — lowest-risk first migration candidate (no
   conflict/rollback complexity; already validate-then-verify shaped).
6. **How should Restore migrate?** §16 — second candidate; its fail-safe/error-
   normalization pattern becomes the engine's *default* behavior for everyone, not a
   restore-only deviation.
7. **How should XML Import migrate?** §16 — last and highest-risk candidate; its
   LIFO-rollback and rich per-record preview are the most complex pieces to generalize.
8. **How should XML Export migrate?** §16 — third candidate; closes the never-called
   `createExportPlan()` gap as a side effect of adopting the engine's canonical Plan.
9. **What interfaces should exist?** §8 — `MigrationSource`, `MigrationSink`,
   `MigrationTransform` (all optional/capability-based), plus canonical `MigrationPlan`
   and `MigrationResult` shapes.
10. **What should never move into the Migration Engine?** §10.5 — format grammar (Tally
    tag names, ZIP byte layout), actual RPC/table specifics, and all real business rules
    (GST math, invoice totals — which already correctly live outside the Data Exchange
    Platform entirely, in `js/gst.js`/`js/sales.js`).
11. **How can future formats be added with near-zero engine changes?** §15 — implement
    the capability interfaces an adapter actually has, register rules/detectors/edges as
    data, reuse existing writers. No engine code changes required for a well-behaved new
    format.

## 5. Design principles

Extends `docs/data-exchange-architecture.md` §14's existing 11 principles with five that
are specific to this milestone:

1. **Additive only.** The engine is introduced as new code living alongside 9A–9E's
   existing orchestration functions. Nothing existing is deleted, renamed, or changed in
   this milestone or its eventual implementation's first phase.
2. **Capability-based adapters, not one mandatory interface.** An adapter declares which
   capabilities it actually has (`read`, `write`, `verify`, `preview`, `resolveConflicts`,
   `rollback`) — the engine adapts its pipeline to what's present rather than forcing
   every adapter to implement methods that don't apply to it. This is not a new idea
   invented for 9F; it is the existing, working shape of the platform, made explicit:
   backup genuinely has no conflict concept, restore genuinely has a no-op rollback, and
   both of those are *correct*, not gaps to force-fill.
3. **The engine coordinates; it does not decide.** Every "what does valid/empty/
   compatible mean" question stays exactly where it is today — inside a provider,
   parser, or formatter. The engine calls `adapter.validate()`; it never contains an
   `if (tableName === 'invoices')` of its own.
4. **One canonical shape per cross-cutting concern.** One `MigrationPlan` shape, one
   `MigrationResult`/history-entry shape, one progress-reporting contract, one error-
   normalization behavior — replacing the current four ad hoc variants of each.
5. **Migrate by strangling, not by rewriting.** An existing orchestration function is
   migrated by having its *body* delegate to the engine while its *exported name and
   signature stay identical* — every existing caller, test harness, and report remains
   valid without modification.

## 6. Proposed architecture

```
                         ┌─────────────────────────────┐
                         │      Migration Engine        │
                         │ (new, format-agnostic core)  │
                         │                               │
                         │  Plan · Validate · Order      │
                         │  Conflict · Preview · Execute │
                         │  Verify · Report · Rollback   │
                         │  Progress · Cancellation       │
                         └───────────┬──────────┬────────┘
                                     │          │
                     reads/writes via│          │calls into (existing, unmoved)
                                     │          │
        ┌────────────────────────────┴──┐   ┌───┴─────────────────────────────┐
        │  MigrationSource / Sink        │   │  Shared infra (existing)        │
        │  (adapter-supplied)            │   │  validators/ conflicts/ preview/ │
        │                                │   │  shared/dependencyGraph.js       │
        │  XML:   tallyXmlParser /       │   │  transactions/ progress/         │
        │         xmlExporter writers    │   │  history/ shared/errors/version  │
        │  Backup: apnabillBackupProvider│   └──────────────────────────────────┘
        │  Restore: apnabillRestoreProv. │
        │  Future: CSV/JSON/ERP adapters │
        └────────────────────────────────┘
```

The engine sits **above** the shared infrastructure that already exists (it doesn't
replace `validators/`, `conflicts/`, `progress/`, etc. — it becomes their one caller) and
**below** the four (eventually more) orchestration entry points, which shrink from "hand-
sequence everything" to "describe this operation's adapter + rules, then call the engine."

## 7. Component diagram

```
Caller (UI / test harness / another module)
   │
   ▼
runXxxMigration(opts)   <- thin, format-specific entry point (today's runApnaBillBackup()
   │                        etc.; unchanged names/signatures after migration, per §5.5)
   ▼
MigrationEngine.run({ source, sink, transform, rules, detectors, edges, capabilities })
   │
   ├─► Plan phase:      source.read() -> transform.toDTO() -> ValidationPipeline (rules)
   │                    -> conflictEngine (detectors, if capability present)
   │                    -> preview (if capability present) -> dependencyGraph (edges)
   │                    -> MigrationPlan
   │
   ├─► Execute phase:   for each planned unit (or one unit, for single-shot operations):
   │                      transform.fromDTO() / sink.write()
   │                      progressTracker.update() (one consistent contract)
   │                      rollback-strategy hook registers an undo step, IF the adapter
   │                        declares one (LIFO / delegated-transaction / none)
   │
   ├─► Verify phase:    adapter.verify() (if capability present) -- pre- or post-execution,
   │                    per the adapter's own declared timing (§13)
   │
   └─► Report phase:    one HistoryEntry, one MigrationResult, cancellation-aware,
                         every thrown value normalized before it leaves the engine
```

## 8. Interfaces

**Illustrative shapes only — proposed for a future implementation, not implemented in
this milestone.** Written in the same JSDoc-`@typedef` + `assertValidX()` style 9A already
established for every other contract in this platform (`backupContract.js`,
`restoreContract.js`, etc.), so a future implementation is a natural extension of the
existing convention, not a new one.

```
@typedef {Object} MigrationSource        -- "how do I get records in"
@property {function(context): Promise<any>} read
  -- returns whatever shape the paired Transform expects (raw XML text, a DB snapshot
     object, parsed archive bytes -- the engine never inspects this itself)

@typedef {Object} MigrationSink          -- "how do I put records out"
@property {function(records, context): Promise<any>} write
  -- one call per planned unit, OR one call for the whole batch, depending on what
     opts.executionMode the adapter declares (§9) -- mirrors the real difference between
     xmlImporter's per-DTO writer calls and restore's single RPC call

@typedef {Object} MigrationTransform     -- "how do I convert between raw and DTO"
@property {function(raw): DTO[]}   [toDTO]     -- import/read direction
@property {function(DTO[]): any}   [fromDTO]   -- export/write direction
  -- both optional: a pure pass-through adapter (e.g. restore, which already receives a
     ready-made snapshot) supplies neither

@typedef {Object} MigrationAdapter       -- what an orchestration entry point assembles
@property {MigrationSource}      source
@property {MigrationSink}        sink
@property {MigrationTransform}   [transform]
@property {ValidationRule[]}     [rules]          -- injected into the existing pipeline
@property {ConflictDetector[]}   [detectors]      -- injected into the existing engine
@property {[string,string][]}    [dependencyEdges]-- injected into the existing graph
@property {function(any): ValidationResult} [verify]       -- pre- or post-execution, adapter's choice (§13)
@property {function(DTO[]): PreviewModel}   [preview]      -- optional
@property {RollbackStrategy}     [rollbackStrategy]        -- 'lifo' | 'delegated' | 'none'
@property {ExecutionMode}        executionMode             -- 'per-unit' | 'single-shot'
```

`assertValidMigrationAdapter()` would check only `source` and `sink` and `executionMode`
as required — every other field is optional, matching principle §5.2 (capability-based,
not one mandatory shape).

## 9. Data flow

The engine's data flow is the same shape regardless of direction — the existing
architecture doc's four separate arrow-diagrams (§6/§7 for XML, §4/§5 for backup/restore)
collapse into one parameterized flow:

```
Source.read()
   -> Transform.toDTO()            (skipped if the source already yields DTO-shaped data)
   -> ValidationPipeline.run(rules)
   -> ConflictEngine.detect(detectors)     [only if detectors provided]
   -> Preview.build()                       [only if preview capability provided]
   -> DependencyGraph.topologicalOrder(edges)
   -> MigrationPlan
   -----------------------------------------------------------------
   -> for each planned unit (executionMode: 'per-unit')
        OR once for the whole plan (executionMode: 'single-shot'):
        Transform.fromDTO()          (skipped if the sink already accepts DTOs)
        Sink.write()
        ProgressTracker.update()      -- ONE contract, granularity implied by executionMode
        RollbackStrategy hook registers an undo step (if 'lifo') or does nothing (if
          'delegated' or 'none')
   -> Adapter.verify()                      [pre-execution if declared that way, else post]
   -> HistoryEntry + MigrationResult (error-normalized, cancellation-checked throughout)
```

`executionMode: 'per-unit'` is exactly what `xmlImporter.js` does today (loop over
`resolvedDtos`, one write call each). `executionMode: 'single-shot'` is exactly what
backup and restore do today (one write call for the whole operation). Export sits
in between (`single-shot` write of the whole formatted output, but iterates internally
during formatting) — it declares `single-shot` and keeps its own internal batching
(the 200-record `await Promise.resolve()` yield in `tallyXmlFormatterV1.js`) entirely
inside its own `Transform.fromDTO()`, invisible to the engine. This is intentional:
**scheduling/yielding behavior is a Transform's own concern, not the engine's.**

## 10. Dependency graph (usage, not a new algorithm)

`shared/dependencyGraph.js` is already generic and already correctly used by exactly one
consumer (`xmlImporter.js`'s fixed `company → item/customer/supplier → sale` order) — the
9C audit already noted this abstraction has never been exercised with a genuinely dynamic
dependency set. The engine changes **who calls it**, not what it does: today, each
orchestration function that needs ordering builds its own `createDependencyGraph()`
inline; under this design, the engine owns the one call site, and every adapter simply
supplies `dependencyEdges` as data (`[['sale','item'], ['sale','customer'], ...]`).
Backup and Restore, which have no real ordering question (a single RPC handles ordering
internally on the Postgres side), simply supply no edges — the graph degenerates to
"no ordering constraint," which is already correct behavior for `createDependencyGraph()`
with zero edges.

### 10.1 What should remain inside adapters (full answer to design question 4)

- Actual parsing grammar: `tallyXmlParser.js`'s tag structure, `apnabillArchiveParserV1.js`'s
  manifest/table-file layout.
- Actual serialization grammar: `tallyXmlWriter.js`'s XML escaping/indentation,
  `zipWriter.js`'s ZIP byte layout.
- Actual DB access: `dataReaders.js`'s Supabase queries, `backup_rpc.sql`/
  `restore_rpc.sql`'s SQL, the real business writers (`createItem`, `saveSaleFromCart`,
  etc.).
- Business-specific validation rules (`xmlBusinessRules.js`, `xmlExportRules.js`) and
  conflict detectors (`xmlConflictDetectors.js`) — these are *injected into* the engine's
  generic pipeline as data, never moved or rewritten.
- Business-specific mapping (item/party/company/voucher mappers) — entirely DTO-in/DTO-out,
  entirely adapter-owned.
- Domain-specific precondition logic — restore's "target company must be empty" check,
  the version-compatibility semantics in `apnabillRestoreProvider.js`'s
  `validateVersion()`. The engine calls `adapter.verify()`; it never encodes what "empty"
  or "compatible" means for any particular format.

### 10.2 What should never move into the Migration Engine (full answer to design question 10)

- **Format grammar** of any kind — Tally XML's `.LIST` convention, `.apnabill`'s
  manifest shape, a future CSV format's delimiter/quoting rules. The engine has zero
  format knowledge, exactly as `zipWriter.js`/`tallyXmlWriter.js` have zero business
  knowledge today (`docs/data-exchange-architecture.md` §14.2's "primitive → format-aware
  → business-aware" split is preserved, not flattened).
- **Real business logic.** GST math, invoice totals, stock mutation — none of this has
  ever been inside the Data Exchange Platform (it lives in `js/gst.js`/`js/sales.js` and
  is reused, never reimplemented, per every prior milestone's own finding) and none of it
  should ever move into the engine either.
- **Database schema specifics.** Table names, column shapes, RPC signatures stay entirely
  inside adapters (`apnabillBackupProvider.js`, `restore_rpc.sql`, `dataReaders.js`).
- **UI/presentation.** Unchanged — nothing in this platform has ever had a UI layer, and
  the engine doesn't introduce one.
- **Tenant/company-specific business rules.** Anything that varies per ApnaBill company
  (GST registration status, loyalty settings) stays entirely inside DTOs and adapters.

## 11. Validation pipeline (as an engine-owned invocation point)

`validators/validationPipeline.js` and its 7 stage validators do not change. What changes
is **when and how consistently they're invoked**: today, each orchestration function
decides for itself whether/when to check `validationResult.isValid()` (§3.1 — four
different answers). Under this design, the engine invokes the pipeline at exactly one
point in the lifecycle (end of the Plan phase, before Execute begins) for every adapter,
every time. This directly fixes the most concrete inconsistency found in §3: `xmlImporter`
gains the self-gating it currently lacks, without changing its DTOs, rules, or writers at
all.

## 12. Progress pipeline (one contract, adapter-declared granularity)

`progress/progressTracker.js` does not change. The engine standardizes **who decides
`totalRecords`**: an adapter declaring `executionMode: 'per-unit'` gets per-record
progress (import's existing behavior, unchanged); an adapter declaring `executionMode:
'single-shot'` gets a single before/after snapshot (backup's existing behavior,
unchanged) — but restore's stage-based reporting becomes available to *any* adapter that
wants finer-than-single-shot granularity without needing full per-unit execution, by
declaring named `stages` alongside `single-shot` mode. This turns three ad hoc
conventions into one parameterized one, without changing what backup or import already
correctly do.

## 13. Conflict handling (opt-in capability, unchanged engine for those who need it)

`conflicts/conflictEngine.js` does not change. Only `xmlImporter.js` uses it today, and
that remains true under this design — an adapter that supplies no `detectors` simply
never triggers conflict detection, exactly as backup and restore correctly don't today.
Restore's "New Company Restore" precondition (target must be empty) is deliberately
**not** modeled as a conflict — a conflict implies "these two things collide and need a
resolution," where restore's actual rule is "refuse outright, there is no resolution
path" (per `docs/milestone-9e-restore-report.md`'s own scope statement). This stays
exactly where it is today: inside `apnabillRestoreProvider.js`'s `verify()`/precondition
logic, never inside the generic conflict engine.

## 14. Transaction strategy (pluggable, not unified into one mechanism)

The three existing strategies are **not** collapsed into one — they are named and made
selectable:

- **`'lifo'`** — generalizes `transactions/transactionEngine.js` exactly as it works
  today: each successful write registers an undo callback; any failure triggers
  reverse-order undo. Available to any future adapter that, like XML import, drives many
  independent writes with no single underlying DB transaction.
- **`'delegated'`** — generalizes restore's model: the adapter's own write step is
  already one atomic operation (a single RPC call backed by a real Postgres transaction);
  the engine's rollback hook is a documented no-op, exactly as `apnabillRestoreProvider.js`'s
  `rollback()` is today.
- **`'none'`** — generalizes backup's model: a read-only (or read-plus-one-audit-insert)
  operation with nothing to roll back.

Choosing the wrong strategy for a future adapter is a real risk (§17) — this is why the
strategy is a declared, named choice an adapter makes explicitly, not something the
engine infers.

## 15. Verification strategy (both pre- and post-execution, adapter's choice)

Two existing patterns, both preserved as legitimate: `apnabillRestoreProvider.js`
verifies **before** writing (fail-safe gate); `apnabillBackupProvider.js` verifies
**after** producing bytes (post-hoc integrity check via `zipReader.js`'s real CRC-32
verification). The engine exposes `adapter.verify()` as one optional capability and lets
the adapter itself decide, via its own internal sequencing, whether that's a
precondition or a postcondition — the engine does not impose a single timing model,
because these two timings answer genuinely different questions ("is it safe to start"
vs. "did what I just produced come out correctly").

## 16. Reporting strategy

One canonical result shape replaces today's four ad hoc return objects (`{result,
validationResult, uploadResult, summary, progressTracker, historyEntry}` for backup;
`{manifest, snapshot, validationResult, previewModel, restoreResult, historyEntry,
progressTracker, cancelled}` for restore; two more distinct shapes for import/export).
Every migration produces exactly one `HistoryEntry` (via the existing, unchanged
`history/historyEntry.js` factory), with `recordCount` and `status` derived by the engine
itself using one rule, not four independently-written ternaries (§3.4). Adapter-specific
extra data (e.g. backup's `uploadResult.location`, restore's `restoreResult.companyId`)
travels in a `details` field on the canonical result — nothing adapter-specific is lost,
it's just no longer part of the *shape* every caller has to special-case.

## 17. Extension points (full answer to design question 11)

Adding a new format under this design means writing:

1. A `MigrationSource` (how to read: a CSV parser, a JSON parser, a future ERP API client).
2. A `MigrationSink` (how to write: reuse the *existing* real writers — `createItem`,
   `saveSaleFromCart`, etc. — exactly as XML import already does; a new format importing
   into ApnaBill needs zero new business-write logic).
3. Validation rules and conflict detectors as **data** (arrays of rule/detector
   functions), registered at the adapter's construction site — not new engine code.
4. Dependency edges as **data**, if the new format's entities have real ordering
   constraints (most won't, if they're importing the same entity set XML already
   handles).
5. A declared `executionMode` and `rollbackStrategy` — almost always `'per-unit'` +
   `'lifo'` for a new *import* format (since it drives the same independent existing
   writers XML import does), or `'single-shot'` + `'none'`/`'delegated'` for a new
   *export/backup* format.

**No engine code changes are required** for a well-behaved new format that fits this
shape — which every format this platform has needed so far (Tally XML, `.apnabill`) does.

## 18. Migration plan from 9A–9E

This milestone (9F) is **design only** — the plan below describes a *future*
implementation milestone's approach, not work done now.

**Phase 1 (future, additive):** Build the Migration Engine core and the interfaces in §8
as genuinely new code. Zero changes to any existing file. Prove the engine against new,
purpose-built test fixtures — not against 9A–9E's existing pipelines yet.

**Phase 2 (future, per-pipeline, in this order):**

1. **Backup first** — lowest risk. No conflict detection, no rollback complexity
   (`'none'` strategy), post-hoc verify only. `runApnaBillBackup()`'s *body* becomes a
   thin call into the engine; its exported name, signature, and return shape stay
   identical, so nothing calling it (including `apnabill.test.html`'s 49 checks) needs to
   change. Re-run that harness with zero tolerance for regression before proceeding.
2. **Restore second** — introduces the `'delegated'` rollback strategy and pre-execution
   verify to the engine, both already proven in isolation by `apnabillRestore.test.html`'s
   69 checks, which must stay green throughout.
3. **XML Export third** — the first pipeline where the engine's canonical
   `MigrationPlan` genuinely replaces something (the never-called `createExportPlan()`
   gap closes as a side effect, not a special case). `xmlExport.test.html`'s 65 checks
   are the regression bar.
4. **XML Import last** — highest complexity: the only pipeline needing `'lifo'` rollback,
   real per-unit execution, and the richest preview/conflict usage. `xmlImport.test.html`'s
   83 checks are the regression bar, and this is where the validation-gate fix (§11)
   has the most actual behavioral effect (import currently has *no* self-gate at all),
   so this migration deserves the most scrutiny of the four.

**Phase 3 (future, only after all four are migrated and stable):** Consider whether the
now-redundant ad hoc plan/result shapes (`import/importPlan.js`'s literal factory going
unused the same way `export/exportPlan.js`'s already does, per the 9C audit) should be
formally deprecated — a decision explicitly deferred, not made here.

At every phase: **no public function is renamed, no signature changes, no schema
changes.** A caller of `runApnaBillBackup()` today calls the exact same function, with the
exact same contract, after Phase 2.1 — it simply runs on the new engine internally.

## 19. Risks

- **Behavioral drift during migration.** Unifying validation-gate timing (§11) is a real
  behavior change for XML Import specifically (it currently has no self-gate at all) —
  migrating it is not purely mechanical and needs explicit test coverage for "a caller
  that used to rely on no self-gate existing" (if any exists) before Phase 2.4 proceeds.
- **Over-abstraction risk.** A capability-based adapter interface can become a leaky
  abstraction if new capabilities are added ad hoc during migration rather than being
  fully specified up front (§8). This is why §8's interfaces are deliberately minimal —
  four fields plus five optional ones — rather than anticipating every possible future
  adapter need now.
- **Rollback-strategy mismatch.** Choosing `'lifo'` for an adapter whose writes aren't
  genuinely independently-undoable (or `'delegated'` for one that isn't genuinely backed
  by a single transaction) would silently reintroduce partial-state risk the current,
  hand-built strategies correctly avoid. The strategy must be an explicit, reviewed
  declaration per adapter, never a default.
- **Losing documented nuance during generalization.** `xmlImporter.js`'s sale-undo is a
  deliberate, explicitly-flagged no-op ("no `voidSale`/`deleteSale` exists anywhere in the
  app today... flagged, not silently no-op'd") — a careless generalization of `'lifo'`
  rollback could accidentally suppress that flag. Any future implementation must
  preserve, not paper over, this kind of per-adapter honesty.
- **Test-regression surface.** Four existing offline harnesses (43+83+65+49+69 = 309
  checks across 9A–9E) all become regression gates the moment any pipeline migrates —
  this is a feature (it's exactly the discipline this platform has held to since 9A), but
  it means Phase 2 is inherently slower than writing the engine itself.

## 20. Alternatives considered

1. **Do nothing.** Rejected: the duplication in §3 is not hypothetical — it already
   caused a real, explicitly-documented asymmetry (restore's error-normalization
   deviating from backup's, on purpose, because backup's gap was real). Leaving four
   independent implementations means every future format re-derives the same decisions,
   with no guarantee of arriving at the same (or even a consistent) answer.
2. **Full rewrite of all four pipelines immediately.** Rejected outright: 9A–9E is
   explicitly stated as production-ready, not a draft; a rewrite maximizes regression
   surface for no functional gain and directly contradicts this milestone's own
   instruction ("Your goal is NOT to redesign it").
3. **A thin shared-utility extraction only** (just pull the `startedAt`/`durationMs`/
   history-entry pattern into one helper function, nothing more). Rejected as
   insufficient: it would resolve §3.4 alone and leave §3.1, §3.2, §3.3, §3.6, and §3.7 —
   the deeper, more consequential inconsistencies — completely untouched.
4. **A single mandatory adapter interface** (every adapter must implement every method:
   `validate`, `verify`, `preview`, `resolveConflicts`, `rollback`, whether it needs them
   or not). Rejected: this is precisely the shape 9A's own `IBackupProvider`/
   `IRestoreProvider` contracts deliberately avoided (`download`/`list`/`delete` are
   already optional on `IBackupDestination`, exactly because a real destination
   legitimately might not support them) — a mandatory interface would force backup to
   fake a conflict-resolution method it will never use.
5. **Recommended: additive engine + capability-based adapters + incremental,
   strangler-fig migration** (§18). This is the only option that resolves the concrete
   problems in §3 without rewriting anything, without breaking any existing public API,
   and without forcing any adapter to implement a capability it doesn't have.

## 21. Final recommendation

Build the Migration Engine as new, additive infrastructure (§6–§9), migrate the four
existing pipelines onto it one at a time in increasing order of complexity — **Backup →
Restore → XML Export → XML Import** (§18) — each gated on its existing offline test
harness staying at 100%, with no public API, file rename, or schema change anywhere in
the process. This resolves every concrete inconsistency found in §3, gives every future
format (CSV, JSON, ERP integrations) a near-zero-code extension path (§17), and does so
without redesigning or destabilizing a platform that is, as stated, already
production-ready.

This document is submitted for review. No implementation work should begin until it is
explicitly approved.
