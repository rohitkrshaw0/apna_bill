# Milestone 9E — Restore Engine: Progress Snapshot (mid-implementation, paused)

This is a temporary status document, not a finished deliverables report (compare
`docs/milestone-9d-backup-report.md`, which IS a finished report). It exists because
implementation was paused mid-milestone for an explicit boundary review. No code was
written or changed to produce this document.

## 0. Git reality check, first

**Nothing in this session has been committed.** `git log` still ends at `ae08ac7 Add
Milestone 9C...`. Every file below — all of 9D and all of 9E-so-far — is either modified
or untracked in the working tree right now:

```
 M js/services/dataExchange/backup/index.js
?? backup_rpc.sql
?? docs/milestone-9d-backup-report.md
?? js/services/dataExchange/apnabill/
?? js/services/dataExchange/backup/backupDestinationContract.js
?? js/services/dataExchange/backup/destinations/
?? restore_rpc.sql
```

"9D is complete" below means *functionally complete and verified in this working tree*,
**not** "committed as its own commit." There is currently no commit boundary between 9D
and 9E at all — that is itself one of the open questions for you to decide (§4).

## 1. Milestone 9D (Backup) — status: functionally complete, verified, uncommitted

Every file, confirmed present by direct listing just now:

```
backup_rpc.sql                                          generate_company_backup_snapshot(_company_id)
docs/milestone-9d-backup-report.md                      finished deliverables report

js/services/dataExchange/backup/
  backupTypes.js                     (9A, unmodified)
  backupContract.js                  (9A, unmodified)
  backupDestinationContract.js       NEW: IBackupDestination contract
  destinations/localDiskBackupDestination.js   NEW: browser-download implementation
  index.js                           MODIFIED (+2 export lines, purely additive)

js/services/dataExchange/apnabill/
  zip/crc32.js                       NEW: CRC-32 primitive
  zip/zipWriter.js                   NEW: ZIP (STORE) writer
  zip/zipReader.js                   NEW: ZIP (STORE) reader, CRC-verifies every entry
  apnabillArchiveFormatterV1.js      NEW: snapshot -> ZIP bytes (IFormatter)
  apnabillBackupProvider.js          NEW: RPC read -> format -> verify -> finalize (IBackupProvider)
  apnabillBackup.js                  NEW: runApnaBillBackup() orchestration (provider + destination)
  index.js                           NEW: public barrel
  apnabill.test.html                  NEW: offline test harness
```

**Public API added (9D):** `crc32`/`crc32Init`/`crc32Update`/`crc32Finalize`, `buildZip`,
`readZip`, `getFormatVersion`, `formatBackupArchive`, `createApnaBillArchiveFormatterV1`,
`createApnaBillBackupProvider`, `runApnaBillBackup` — all exported from
`apnabill/index.js`. Plus `assertValidBackupDestination`/`createBaseBackupDestination`
(contract) and `createLocalDiskBackupDestination`, exported from `backup/index.js`.

**Tests:** `apnabill/apnabill.test.html` — confirmed **49/49 checks passed**, run
headlessly just now (`grep -c "check("` on the file also confirms 49 `check(...)` call
sites). Regression re-runs at the same time: `xmlExport.test.html` (9C) 65/65,
`xmlImport.test.html` (9B) 83/83, `dataExchange.test.html` (9A) 43/43 — all still passing,
zero regressions.

**Not verified (documented, not hidden):** `apnabillBackupProvider.js`'s `backup()` (real
Supabase RPC call) and `localDiskBackupDestination.js`'s `upload()` (real browser
download) — neither is exercised by the test harness, both for reasons recorded in the
harness's own header comment (no DB credentials reachable here; a real download is a side
effect a test suite shouldn't trigger). `backup_rpc.sql` has never run against a live
database.

**Verdict: 9D's own scope (Backup only, "New Company Restore" explicitly deferred) is
done.** Nothing about pausing Restore implementation requires touching 9D further.

## 2. Milestone 9E (Restore) — status: partially implemented, NOT wired together, NOT tested

Two files exist. **Nothing else does.** Confirmed by direct directory listing — no
`apnabillRestoreProvider.js`, no `apnabillRestore.js` (orchestration) exist anywhere in
the tree.

```
restore_rpc.sql                                                    NEW, 200 lines
js/services/dataExchange/apnabill/apnabillArchiveParserV1.js       NEW, 53 lines
```

Neither file is:
- **exported from `apnabill/index.js`** (checked directly — the barrel still only lists
  the 9D exports above; `parseBackupArchive` is not in it)
- **imported or called from anywhere** (nothing in the tree references
  `apnabillArchiveParserV1.js` or `restore_rpc.sql` yet)
- **tested** (`apnabill.test.html` still has exactly 49 `check(...)` calls, the same count
  as before any 9E work started — zero new test coverage for either file)

### 2a. `restore_rpc.sql` — `restore_company_from_snapshot(_company_id, _snapshot)`

Never run against a live database (same standing limitation as every `*_rpc.sql` file in
this repo). Written, not executed, not reviewed by you yet. Architecture decisions baked
into it (§3) are exactly the kind of thing this pause is meant to let you check before
more code is built on top of them.

### 2b. `apnabillArchiveParserV1.js` — `parseBackupArchive(archiveBytes)`

The inverse of `apnabillArchiveFormatterV1.js`: reads a `.apnabill` ZIP back into
`{ manifest, snapshot }` via `zip/zipReader.js` (which CRC-verifies every entry).
Deliberately omits a table's key entirely from `snapshot` when its file is missing from
the archive (rather than writing `null`), so a future `validateSchema()` can distinguish
"file genuinely absent" from "file present, content is the JSON literal `null`" (a real
distinction `apnabillArchiveFormatterV1.js` itself produces intentionally — see its own
`null`-not-fabricated tests in the harness). This file has NOT been executed even once,
manually or otherwise — no smoke test, no round-trip check against a real
`formatBackupArchive()` output. It is untested code.

## 3. Architecture decisions already made (in `restore_rpc.sql`, un-reviewed)

These were decided while writing the SQL, based on your answer to the earlier scope
question ("New Company Restore" only, empty-target precondition, no merge). They have
**not** been reviewed by you at the code level yet:

1. **"Empty company" is checked against 17 specific tables**, not all 21: `parties`,
   `items`, `item_custom_field_defs`, `item_custom_field_values`, `batches`,
   `stock_ledger`, `invoices`, `invoice_lines`, `payments`, `purchases`, `purchase_lines`,
   `manufacturing_runs`, `manufacturing_lines`, `loyalty_transactions`, `print_settings`,
   `audit_log`, `invoice_attachments`. Excluded from the emptiness check: `firms`,
   `payment_types`, `invoice_prefixes` — because `create_company()` (schema.sql) always
   seeds these three (1 default firm, 5 payment types, 6 invoice prefixes) for *every*
   company, so a literal "zero rows anywhere" check would reject every company that has
   ever been created through the normal app flow, including a genuinely fresh one. This
   is a load-bearing interpretation of what "empty" means for this feature — worth your
   explicit sign-off, since it wasn't something you specified directly.
2. **Those three "config" tables are wiped and replaced unconditionally**, not gated on
   emptiness, reasoning: since the 17-table check already proves nothing transactional
   references the target's existing default firm/payment-types/prefixes yet, deleting and
   replacing them with the backup's real values is safe (no foreign key can be
   orphaned) — but it does mean any manual customization to those three tables made
   between company creation and running restore is silently discarded. Not flagged to the
   user anywhere yet (no UI exists, and the RPC itself doesn't warn about this — it just
   does it).
3. **`company_id` is rewritten on every row** to the restore target's actual id via a new
   helper function, `remap_snapshot_company_id()`, added directly to `restore_rpc.sql`.
   Every other column, including every row's own primary key and every cross-table
   foreign key, is preserved byte-for-byte from the backup. This was necessary because the
   snapshot's rows carry the *original* company's id, which will usually differ from the
   restore target's id.
4. **The `companies` row itself is `UPDATE`d, never `INSERT`ed** — the backup's `company`
   JSON object carries the original company's `id`, which must never be written; only
   `name`/`fy_start_month`/`loyalty_*` fields are copied onto the existing target row.
   `id`/`created_by`/`created_at`/`is_active` are left untouched on purpose.
5. **Atomicity relies entirely on Postgres's own plpgsql semantics** (an unhandled
   exception anywhere in the function body rolls back everything the function already
   did) — no explicit `BEGIN`/`COMMIT`, no savepoints. This mirrors `backup_rpc.sql`'s
   existing style but has not been stress-tested against a real constraint-violation
   scenario (e.g., a backup snapshot with a shape Postgres's `jsonb_populate_recordset`
   can't cleanly map onto a table).
6. **Insertion order** across the 20 non-`company` tables was derived by hand from
   `schema.sql`'s foreign key declarations (documented inline in the SQL) — not verified
   by actually running it against a live schema.

None of these decisions are implemented or cross-checked in JS yet (no
`apnabillRestoreProvider.js` exists to call this RPC, so nothing has exercised this SQL
even in a mocked/injected sense the way `apnabillBackupProvider.js`'s `verify()` logic was
exercised offline).

## 4. Remaining work (not started)

- `apnabillRestoreProvider.js` implementing 9A's `IRestoreProvider`
  (`validateVersion`/`validateSchema`/`validateCompatibility`/`preview`/`restore`/
  `rollback`). Design was discussed but zero code was written.
  - `rollback()` in particular was going to be a **documented no-op** for New Company
    Restore specifically (the RPC call is one atomic transaction; by the time it returns,
    there's nothing left at the JS layer to undo) — this reasoning has not been reviewed
    by you and is worth confirming before it's written, since a no-op `rollback()` on a
    contract method is a notable enough decision to flag explicitly rather than bury in
    code.
  - `preview()` was going to reuse 9A's `preview/` folder with one `PreviewItem` per
    *table* (not per row) showing row counts — also undiscussed with you at the code level.
- `apnabillRestore.js` — a `runApnaBillRestore()` orchestration function mirroring
  `runApnaBillBackup()`. Not started.
- Wiring `parseBackupArchive`/the restore provider/orchestration into `apnabill/index.js`.
- Any test coverage for `apnabillArchiveParserV1.js` or `restore_rpc.sql` — currently zero.
- A `docs/milestone-9e-restore-report.md` finished report (this progress file is
  explicitly not that).
- **Disaster Recovery Restore** — explicitly out of scope per your answer to the earlier
  scope question; not designed, not planned in detail, deliberately deferred to a later
  milestone.

## 5. Risks worth naming before continuing

- **`restore_rpc.sql` is the first piece of code in this entire Data Exchange Platform
  (9A–9E) that writes business data across many tables in one shot**, as opposed to
  9A–9D's read-only/single-row-audit-insert pattern. It has not been executed even once —
  not against a live database (no credentials reachable, standing limitation), and not
  even via a mocked/offline harness the way every other piece of SQL-adjacent logic in
  this platform (e.g., the backup provider's `verify()`) was at least exercised offline
  before being trusted.
- **The "empty company" table list (§3.1) is an interpretation, not something you
  specified directly** — it's the single highest-leverage decision in this file, because
  getting it wrong either rejects legitimate restores (too strict) or allows silent data
  loss to the config tables (too loose, though bounded as reasoned in §3.2). Worth your
  explicit confirmation before any JS is built to call this function.
- **No test coverage exists for either 9E file.** Given 9D's own bar (49/49 offline
  checks before being called "done"), continuing to build `apnabillRestoreProvider.js`
  and `apnabillRestore.js` on top of an *already untested* `restore_rpc.sql` and
  `apnabillArchiveParserV1.js` would compound that gap rather than close it.

## 6. What this document is not

Not a recommendation, not a plan, not a next-steps proposal beyond the literal remaining-
work list in §4. Waiting for explicit approval of the milestone boundary before writing
any more code, per your instruction.
