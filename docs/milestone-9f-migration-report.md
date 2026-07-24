# Milestone 9F — Migration Engine: Migration Report

Deliverables document for the Migration Engine and the migration of all four existing
Data Exchange pipelines (Backup, Restore, XML Export, XML Import) onto it. This report
covers what was actually built and verified; consult
`docs/milestone-9f-migration-engine-design.md` for the approved design's full reasoning
(concrete duplication evidence, alternatives considered, risk analysis) and
`docs/data-exchange-architecture.md` §2a/§3/§4–§7/§11/§13/§14/§16 for how the engine now
fits into the platform's permanent architectural reference — neither is repeated here.

## 1. Objective

Replace four independently hand-written orchestration functions — each implementing the
same conceptual sequence (plan → validate → execute → report) with its own drifted
sequencing, validation-gate timing, progress granularity, error handling, and history-
entry construction — with one shared, capability-based Migration Engine, **without**
changing any public API, file name, or database schema, and **without** rewriting any
business logic (parsers, formatters, providers, RPCs, real business writers).

## 2. Architecture implemented

```
Orchestration entry points (unchanged names/signatures)
  runApnaBillBackup() / runApnaBillRestore() / runXmlExport() / createXmlImporter().run()
                              │
                              ▼
              createMigrationEngine().run(adapter, opts)
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  source.read()      [validators/detectors/    Execute (per-unit or
  → transform         preview, all optional]    single-shot, via the
  .toDTO()                    │                  adapter's chosen
                              ▼                  rollback strategy:
                       MigrationPlan             'lifo' / 'delegated' / 'none')
                              │                         │
                              └──────────┬──────────────┘
                                         ▼
                        [adapter.verify(), pre- or post-execution]
                                         ▼
                     HistoryEntry + MigrationResult
                (error-normalized, cancellation-checked throughout)
```

Every step is a capability an adapter declares only if it needs it — no adapter
implements a method it doesn't use. The engine coordinates existing, **unmodified**
shared infrastructure (`validators/`, `conflicts/conflictEngine.js`,
`shared/dependencyGraph.js`, `progress/progressTracker.js`, `history/historyEntry.js`,
`transactions/transactionEngine.js`); it introduces no new business rule and
re-implements none of those pieces.

## 3. Files added

**Migration Engine core** (`js/services/dataExchange/migration/`, 8 files, all new):

| File | Purpose |
|---|---|
| `migrationAdapter.js` | The one capability-based contract — only `source`/`sink`/`executionMode` required |
| `migrationPlan.js` | Canonical `MigrationPlan` shape (mirrors `createImportPlan()`'s deep-freeze convention) |
| `migrationResult.js` | Canonical `MigrationResult` shape (not deep-frozen — matches every existing orchestration return value) |
| `rollbackStrategies.js` | Names/selects the three existing mechanisms (`'lifo'` reuses `transactionEngine.js` unchanged; `'delegated'`/`'none'` are no-op strategies) |
| `errorNormalization.js` | Generalizes the normalize-or-pass-through pattern that existed only in `apnabillRestore.js` before 9F |
| `migrationEngine.js` | The orchestrator itself |
| `index.js` | Public barrel |
| `migration.test.html` | Dedicated offline test harness — 48 checks against synthetic fixtures only |

**Design and reference docs** (2 files): `docs/milestone-9f-migration-engine-design.md`,
`docs/milestone-9f-migration-report.md` (this document).

## 4. Files modified

| File | What changed |
|---|---|
| `apnabill/apnabillBackup.js` | `runApnaBillBackup()`'s body now builds a backup-shaped `MigrationAdapter` and calls the engine |
| `apnabill/apnabillRestore.js` | `runApnaBillRestore()`'s body now builds a restore-shaped `MigrationAdapter` and calls the engine |
| `xml/export/xmlExporter.js` | `runXmlExport()`'s body now builds an export-shaped `MigrationAdapter` and calls the engine; `buildXmlExportPlan()`/`createXmlExporter()` untouched |
| `xml/xmlImporter.js` | `createXmlImporter().run()`'s body now builds an import-shaped `MigrationAdapter` and calls the engine; `buildXmlImportPlan()`/`defaultWriters`/`resolveSaleReferences` untouched |
| `xml/xmlExport.test.html` | +9 new checks (see §9) |
| `docs/data-exchange-architecture.md` | Updated to describe the engine as a permanent architectural layer (§2a new; §3, §4–§7, §11, §13, §14, §16 updated) |

**Not modified, confirmed byte-for-byte**: `apnabillBackupProvider.js`, `apnabillArchiveFormatterV1.js`,
`apnabillRestoreProvider.js`, `apnabillArchiveParserV1.js`, `localDiskBackupDestination.js`,
`zipWriter.js`/`zipReader.js`, `backup_rpc.sql`, `restore_rpc.sql`, `tallyXmlFormatterV1.js`,
`tallyXmlWriter.js`, `tallyXmlParser.js`, every mapper, `defaultWriters`,
`resolveSaleReferences()`, `buildXmlExportPlan()`, `buildXmlImportPlan()`, every business
validation rule and conflict detector, and every real business writer (`createItem`,
`createPartyQuick`, `createSupplier`, `saveSaleFromCart`).

## 5. Migration order

Executed exactly as the approved design's §18 specified, increasing risk order, each
gated on its own existing offline harness before proceeding to the next:

1. **Backup** — lowest risk (no conflict/rollback complexity). Caught and fixed a real
   call-order regression on the first attempt (`provider.finalize()` fired before
   `provider.verify()`, breaking one orchestration test) before proceeding.
2. **Restore** — introduced the `'delegated'` rollback strategy; passed its full 69-check
   suite on the first attempt.
3. **XML Export** — passed its (newly-added, see §9) coverage on the first attempt.
4. **XML Import** — highest risk (real writes, LIFO rollback, sale-undo's documented
   no-op nuance, per-entity-type error attribution); passed its full 83-check suite on
   the first attempt, including exact write-order, LIFO-undo-order,
   `transactionEngine.getState()`, error-message, and progress-event-count assertions.

## 6. Behavior preserved

- Every migrated function's **exported name, parameter list, and return shape** —
  unchanged. `createXmlImporter().run(plan, {transactionEngine, progressTracker})` in
  particular required the engine to accept an externally-supplied
  `progressTracker`/`transactionEngine` and use it directly (rather than constructing its
  own), specifically so a caller's `transactionEngine.getState()` still reflects
  `ROLLED_BACK`/`COMMITTED` reality — the one additive capability the engine gained
  during Phase 2.
- **Import's lack of a validation self-gate** — `run()` still never checks validity
  itself; `buildXmlImportPlan()`'s own `validationResult` remains the sole gate, still a
  caller's responsibility to check.
- **Restore's `validateVersion()` → `validateSchema()` → `preview()` → `restore()` call
  order** — preserved exactly, by routing the first two through the engine's
  `validators` mechanism (which runs before `preview`) rather than its `verify` hook
  (which runs after) — a deliberate, documented routing choice, not an accident.
- **Backup's `prepare()` → `backup()` → `verify()` → `finalize()` call order** — preserved
  by moving the `finalize()` call into the `verify` adapter function itself, after the
  Phase-1 attempt put it in the wrong place (§8).
- **`recordCount`'s exact derivation** for Backup (`provider.finalize()`'s authoritative
  `tableCounts`, not the engine's own Plan-phase estimate) and for every other pipeline
  (matches pre-9F values exactly).
- **XML Import's sale-undo no-op** — still a deliberate, flagged no-op (`writers.sale.undo`
  is untouched); the engine's generic `undo` dispatch just calls whatever the writer
  itself defines.
- **Every business rule, conflict detector, mapper, RPC, and real writer** — byte-for-byte
  untouched (§4).

## 7. Behavior intentionally standardized

Per the approved design's own stated goal (§3, §12) — these are deliberate consequences
of adopting one shared engine, not accidents, and each was confirmed to break zero
existing tests before being accepted:

- **Error normalization now applies to all four pipelines**, not just Restore. A thrown
  error from Backup's `provider.backup()`/`destination.upload()`, or from an Import
  writer, is now caught and normalized into the result instead of propagating as an
  unhandled rejection.
- **Restore's progress reporting is now single-shot** (`totalRecords: 1`), not the
  4-stage (parse/validate/preview/restore) reporting it had before 9F. No test asserted
  on the old stage count. This is the one standardization not explicitly called out in
  its own migration commit at the time — caught and disclosed while updating the
  architecture doc, recorded here for completeness.
- **Backup's progress tracker stays at its pristine 0% state on a failed pre-execution
  verify**, rather than always reporting "1/1, failed" — arguably more honest (nothing
  was attempted), previously untested either way.
- **A single canonical `MigrationPlan`/`MigrationResult` shape** now exists (`migration/`),
  alongside — not replacing — `import/importPlan.js`'s `createImportPlan()` (still used)
  and `export/exportPlan.js`'s `createExportPlan()` (still unused, unchanged, deprecation
  explicitly deferred per the design's §18 Phase 3).

## 8. Regression results

Final complete sweep, run after every code change in this milestone including the
closeout cleanup commit:

| Suite | Result |
|---|---|
| `dataExchange.test.html` (9A) | 43/43 ✅ |
| `xmlImport.test.html` (9B) | 83/83 ✅ |
| `xmlExport.test.html` (9C) | 74/74 ✅ (65 original + 9 new) |
| `apnabill.test.html` (9D) | 49/49 ✅ |
| `apnabillRestore.test.html` (9E) | 69/69 ✅ |
| `migration.test.html` (9F) | 48/48 ✅ |
| **Total** | **366/366 ✅** |

One real regression was caught and fixed during implementation (Backup's `finalize()`/
`verify()` call order, §5/§6) — re-verified to 100% before the migration was considered
done. No other regression occurred at any point.

## 9. New test coverage

- **`migration/migration.test.html`** (48 checks, new): contract shape, `validateVersion`-
  style validators, per-unit and single-shot execution, the validation gate, LIFO
  rollback (including undo ordering), the delegated/none strategies, error normalization
  (both plain-error-wrapping and already-normalized pass-through), preview/conflict opt-in
  capabilities, dependency ordering, pre- vs. post-execution `verify()` timing, and
  cancellation at both checkpoints — all against synthetic fixtures, never against a real
  pipeline.
- **`xml/xmlExport.test.html`** (+9 checks): `runXmlExport()` had **zero** prior coverage
  (confirmed by grep before migrating it — neither `runXmlExport` nor `createXmlExporter`
  was ever imported by this harness). Added coverage for the happy path (exact
  prepare→export→finalize call order, `xml`/`dtos`/`summary`/`companyDto`/history all
  correct), the invalid-plan path (formatter never called, `xml` stays `null`), and
  confirmation that the real `createXmlExporter()`'s own pre-existing defensive
  empty-return still works unchanged.

## 10. Remaining technical debt

- **No test asserts Restore's new single-shot progress behavior** (§7) — nothing would
  catch a future accidental reversion or further drift, since nothing catches the current
  state either.
- **`import/importPlan.js`'s `createImportPlan()`** is still built and used by
  `buildXmlImportPlan()`; **`export/exportPlan.js`'s `createExportPlan()`** is still built
  and used by nothing — both coexist with `migration/migrationPlan.js` rather than being
  reconciled. Explicitly deferred (design doc §18 Phase 3), not an oversight.
- **The engine's extension story is proven only against the four pipelines it was built
  from** — no fifth (CSV/JSON/ERP) adapter exists yet to validate the "near-zero engine
  changes" claim (design doc §17) against a genuinely new format.
- **`transform.fromDTO`/`toDTO` don't receive `context`** — none of the four migrations
  needed it (each closed over `opts` instead), but a future adapter might, and would need
  either that plumbed through or another closure-based workaround.
- **`migrationEngine.js`'s cancellation hooks remain "checked only at stage boundaries"**
  — inherited as-is from Restore's pre-9F pattern, still cannot interrupt a write already
  in flight, for any of the four pipelines.

## 11. Future extension points

Per the approved design's §17 and the updated architecture reference's §13/§16: a new
export format needs an `IExporter`+`IFormatter` pair described as a `MigrationAdapter`
(`'single-shot'`, `'none'`); a new import format needs an `IDataParser` plus an
`IImporter.run()` describing a `MigrationAdapter` (`'per-unit'`, `'lifo'`, writing through
existing real business writers); a new backup destination needs only
`IBackupDestination.upload()`, injected with zero engine changes; Disaster Recovery
Restore, Cloud Backup, Incremental Backup, and Sync all remain explicitly out of scope,
as they were before this milestone.

## 12. Final assessment

All four pipelines now run on one shared, capability-based Migration Engine. Every
concrete duplication/inconsistency finding in the approved design (§3.1–§3.8) is
resolved: validation-gate timing is now engine-owned and consistent per adapter's
declared capabilities; progress reporting has one contract; error normalization applies
uniformly; history-entry construction and status derivation happen in one place; rollback
strategy is a named, explicit choice instead of four hand-built mechanisms. No public API,
file name, or database schema changed anywhere in the process. No business logic —
parsing, formatting, mapping, validation rules, conflict detectors, RPCs, or real writers
— was rewritten. 366/366 checks pass across all six suites, including 48 new
purpose-built engine checks and 9 new checks closing Export's prior zero-coverage gap.
The one behavior standardization not disclosed at the time it happened (Restore's
progress granularity) has been surfaced and recorded here, with no test regression as a
result. The milestone is complete and ready for review.
