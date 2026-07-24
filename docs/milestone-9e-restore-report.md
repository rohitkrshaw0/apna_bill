# Milestone 9E — ApnaBill Restore Engine: Restore Report

Deliverables document for the ApnaBill restore engine, built on Milestone 9A's Data
Exchange Platform (`restore/restoreContract.js`) and Milestone 9D's `.apnabill` archive
format, exactly the way 9D built the backup engine on 9A's `backup/backupContract.js`.
Scope for this milestone (branch `milestone-9d-apnabill-backup`, continued) is **"New
Company Restore" only** — restoring a `.apnabill` archive into a genuinely empty target
company. **Disaster Recovery Restore** (full replacement of an existing, non-empty
company) was explicitly scoped out during this milestone's design review and remains
unimplemented; see §6.

This report supersedes `docs/milestone-9e-progress.md`, which was a temporary
mid-implementation status snapshot written when work was paused for an explicit
milestone-boundary review. That review's outcome (approve "New Company Restore" scope,
require a documented empty-company table justification, then proceed) is folded into this
report rather than repeated as a separate document. The snapshot file itself was later
deleted as obsolete once this report existed (commit `2fd666b`, "remove obsolete restore
progress snapshot") — it no longer exists in the repository; this paragraph is kept only
as the historical record of what that review covered.

## 1. What was built

```
restore_rpc.sql                                        restore_company_from_snapshot(_company_id, _snapshot)
                                                         -- Postgres-side "New Company Restore," §3

js/services/dataExchange/apnabill/
  apnabillArchiveParserV1.js        NEW: .apnabill ZIP -> {manifest, snapshot} (inverse of the 9D formatter)
  apnabillRestoreProvider.js        NEW: IRestoreProvider (validateVersion/validateSchema/
                                     validateCompatibility/preview/restore/rollback)
  apnabillRestore.js                NEW: runApnaBillRestore() orchestration
  apnabillRestore.test.html         NEW: dedicated offline test harness (69 checks)
  index.js                          extended: +parseBackupArchive, +createApnaBillRestoreProvider,
                                     +runApnaBillRestore

docs/milestone-9e-restore-report.md   this document
docs/milestone-9e-progress.md         superseded mid-implementation snapshot (since deleted, see above)
```

5 new files, 1 modified (`apnabill/index.js`, purely additive). `restore/restoreContract.js`
(9A) is **unmodified** — every method its `IRestoreProvider` typedef declares
(`validateVersion`/`validateSchema`/`validateCompatibility`/`preview`/`restore`/`rollback`)
was implemented as-is; see §7 for the one pragmatic adjustment (async) that also applied
to 9D's `IBackupProvider`.

## 2. Architecture

```
.apnabill bytes -> Parser -> {manifest, snapshot} -> Provider (validate/preview/restore) -> HistoryEntry
                     |              |                        |
              zip/zipReader.js   validateVersion/          restore_company_from_snapshot()
              (9D, CRC-verified) validateSchema             (one Postgres transaction)
```

- **Parser** (`apnabillArchiveParserV1.js`) is the direct inverse of 9D's
  `apnabillArchiveFormatterV1.js`: reads a `.apnabill` archive via 9D's `zip/zipReader.js`
  (which already CRC-verifies every entry) and reconstructs `{manifest, snapshot}` in
  exactly the shape `generate_company_backup_snapshot()` originally produced — ready to
  hand straight to the restore RPC with no further reshaping. Deliberately omits a
  table's key from `snapshot` entirely when its file is genuinely absent from the archive
  (rather than writing `null`), so `validateSchema()` can tell "file missing" apart from
  "file present, content is the JSON literal `null`" — a real distinction 9D's formatter
  itself produces intentionally.
- **Provider** (`apnabillRestoreProvider.js`) implements 9A's `IRestoreProvider`. Built
  **fail-safe by construction**: `restore()` re-validates (`validateVersion` +
  `validateSchema`) as its own first action, regardless of whether a caller already did —
  calling it directly, bypassing the orchestration layer entirely, is exactly as safe as
  going through one. The real RPC call is injectable (`opts.rpc`), the same
  dependency-injection pattern `runApnaBillBackup({provider, destination})` already
  established, which is what let this milestone's test harness exercise restore-shaped
  behavior deterministically without a live database (§5).
- **Orchestration** (`apnabillRestore.js`, `runApnaBillRestore()`) sequences
  parse → validate → preview → restore → history entry, mirroring 9D's
  `runApnaBillBackup()` one layer above its pieces. It introduces **no business rule of
  its own** — what "valid" means lives in the provider, what "empty company" means and
  what actually gets written lives in the RPC. Its own responsibilities, all pure
  coordination: provider injection, stage-based progress reporting (`progressTracker`
  advances through 4 named stages: parse/validate/preview/restore), a `preview()` call
  that always runs once parsing succeeds (informational, never gated on validity — a
  future UI can show "what's in this file" even for an archive that will be refused),
  consistent `SUCCESS`/`FAILED` history-entry status, **error normalization** (see below),
  and **cancellation hooks for future use** (see below).

### Error normalization — a deliberate deviation from 9D's own pattern

`runApnaBillBackup()` lets a provider's exception propagate up uncaught — nothing in 9D's
read-only pipeline needed to survive one. Restore writes data, so an uncaught exception
here is a worse failure mode than a normalized "failed" result. Every stage in
`runApnaBillRestore()` is wrapped; any thrown value (a plain `Error`, a
Postgres/PostgREST error object, or one of `apnabillRestoreProvider.js`'s own
`createDataExchangeError()` throws) is normalized into the returned
`validationResult`/`historyEntry` instead of an unhandled rejection. An object that
already looks like this platform's own error shape (has `category` and `severity` fields)
is passed through unchanged, not double-wrapped — verified directly (§5).

### Cancellation hooks — explicitly partial, not a complete feature

`opts.signal` (a standard `AbortSignal`) is checked at two stage boundaries: before
parsing starts, and after `preview()` but before `restore()` is called. This is a
structural hook for a future "Cancel" UI affordance, **not** a complete cancellation
feature — no in-flight RPC call is actually abortable yet (the real `defaultRpc()` isn't
wired to any signal), so cancellation can only stop the pipeline *between* stages, never
interrupt a write already in progress. Since `HISTORY_STATUS` has no `CANCELLED` value,
a cancelled run reports `status: FAILED` plus a separate `cancelled: true` field on the
returned bundle and a `WARNING` (not an `ERROR`) recorded against it — a deliberate,
minimal choice recorded here rather than extending the shared `HISTORY_STATUS` enum for a
feature that isn't finished yet.

## 3. `restore_company_from_snapshot()` — the "New Company Restore" algorithm

Full justification for every one of the 21 tables (must-be-empty vs. excluded, and
exactly how each excluded table is handled) was produced and approved as its own review
step before this RPC was implemented; the complete per-table table is preserved in this
milestone's conversation record rather than duplicated here. Summary:

- **17 tables must be genuinely empty** for the target company before anything is
  touched: `parties`, `items`, `item_custom_field_defs`, `item_custom_field_values`,
  `batches`, `stock_ledger`, `invoices`, `invoice_lines`, `payments`, `purchases`,
  `purchase_lines`, `manufacturing_runs`, `manufacturing_lines`, `loyalty_transactions`,
  `print_settings`, `audit_log`, `invoice_attachments`. Checked in full, dynamically
  (`execute format('select exists(...)', tbl_name)`), **before** a single `DELETE`/
  `INSERT` runs anywhere — confirmed by direct reading of `restore_rpc.sql`.
- **3 tables are excluded from that check and unconditionally wiped-then-replaced**:
  `firms`, `payment_types`, `invoice_prefixes` — because `create_company()` (schema.sql)
  always seeds these for every company, so "zero rows" is impossible for any company
  created through the normal app flow. Safe because the 17-table check already proves
  nothing yet references the seeded defaults by foreign key. `invoice_prefixes`
  additionally *requires* replacement, not just permits it: its `next_seq` must reflect
  the backup's real value, or the first invoice created after restore would collide with
  an already-restored invoice number.
- **`companies` itself is `UPDATE`d, never `INSERT`ed or deleted**: only
  `name`/`fy_start_month`/`loyalty_*` fields are copied from the backup; `id`/
  `created_by`/`created_at`/`is_active` are left untouched — the target row's identity
  belongs to the current Supabase project, not to whatever the backup recorded.
- **Every row's `company_id` is remapped** to the restore target via a new helper,
  `remap_snapshot_company_id()`, added directly to `restore_rpc.sql`. Every other column
  — every row's own primary key, every cross-table foreign key — is preserved
  byte-for-byte, which is what keeps the restored data's internal references
  self-consistent.
- **Insertion order** respects every foreign key in `schema.sql`: firms → payment_types →
  invoice_prefixes → parties → items → item_custom_field_defs → item_custom_field_values
  → batches → stock_ledger → invoices → purchases → invoice_lines → purchase_lines →
  payments → manufacturing_runs → manufacturing_lines → loyalty_transactions →
  print_settings → invoice_attachments, with `audit_log` last (historical rows, then one
  new row logging the restore event itself, mirroring `backup_rpc.sql`'s own
  "log inside the same transaction" pattern).
- **Atomicity relies entirely on Postgres's own plpgsql semantics**: the whole function
  body is one transaction; any unhandled exception unwinds every `DELETE`/`INSERT` it
  already made. No explicit `BEGIN`/`COMMIT`, no savepoints — there is nothing for this
  provider or the orchestration layer to add, because there is exactly one RPC call and
  Postgres already guarantees all-or-nothing for it.

## 4. Contract conformance

`restore/restoreContract.js`'s `IRestoreProvider` — unmodified since 9A, and never
implemented by anything real until this milestone (exactly what 9C's own architecture
audit predicted might need renegotiation) — held up **without any shape change**:
`validateVersion(version)` / `validateSchema(schema)` / `validateCompatibility(version,
minCompatible)` / `preview(backup)` / `restore(backup)` / `rollback()` all mapped
directly onto their intended purpose. The one pragmatic adjustment, identical in kind to
9D's own: neither the typedef nor `assertValidRestoreProvider()` specifies `async`, but
`restore()` must be async (it awaits an RPC round-trip); `assertValidRestoreProvider()`
only checks `typeof candidate[method] === 'function'`, which an `async function` still
satisfies, so no contract file edit was needed.

`rollback()` is a **documented no-op** for this restore mode — not a missing feature, a
deliberate one, explained directly in the provider's own comment: `restore_company_from_snapshot()`
is one Postgres transaction, so by the time `restore()` has settled (resolved or thrown),
there is nothing left open at this layer to undo. A real "undo an already-completed
restore" would be a materially different, higher-blast-radius operation (effectively a
Disaster Recovery Restore run in reverse) and is out of scope for the same reason that
mode itself is (§6).

## 5. Verification performed

`apnabill/apnabillRestore.test.html` — **69/69 checks passed**, run headlessly, fully
offline, same convention as every prior harness:

```
python -m http.server 8743
chrome --headless=new --disable-gpu --virtual-time-budget=8000 --dump-dom \
  http://localhost:8743/js/services/dataExchange/apnabill/apnabillRestore.test.html
```

**Critical scope note, stated directly in the harness's own header comment**: there is no
live Supabase project reachable from this environment — `restore_rpc.sql` has never
executed against real Postgres. To still exercise the *algorithm's* logic deterministically,
the harness contains a hand-written JS re-implementation of `restore_rpc.sql`'s documented
algorithm (same empty-check table list, same wipe-then-replace behavior, same company_id
remap, same in-place company update, same "nothing commits until every step succeeds"
atomicity via a draft-then-commit pattern). Every "verify company metadata update" /
"verify config-table replacement" / "verify next_seq preservation" / "verify rollback"
check in this milestone verifies **that JS re-implementation's logic**, and separately
verifies that `apnabillRestoreProvider.js` correctly calls whatever `rpc` function it's
given — **not** that the actual SQL file, as written, behaves this way under real
Postgres. That gap is narrower after this milestone (algorithm logic and provider
integration are both exercised) but not closed.

Coverage, organized by what was explicitly required:

- **Successful restore into a valid empty company**: business tables populated from the
  snapshot, every row's `company_id` remapped to the target, original row ids preserved.
- **Rejection of a non-empty company**: a pre-existing `items` row causes an immediate
  refusal naming the table, and the simulated database is confirmed **byte-identical** to
  its pre-call state (deep equality) — proving the rejection touched nothing.
- **Rollback on injected failure**: a failure injected after `items` is "inserted" but
  before `invoices` still leaves the simulated database **completely unchanged**,
  including the row that had already been written one step earlier — proving the
  draft-then-commit pattern genuinely models all-or-nothing behavior, not just a
  best-effort partial write.
- **Company metadata update**: `name`/`fy_start_month`/`loyalty_enabled` updated from the
  backup; `id`/`created_by` confirmed preserved.
- **firms/payment_types/invoice_prefixes replacement**: seeded default rows confirmed
  gone; the backup's own rows confirmed present with `company_id` remapped.
- **`invoice_prefixes.next_seq` preservation**: the backup's value (`57`) confirmed to
  survive restore, not reset to the fresh default (`1`).
- **Fail-safe**: 4 checks confirming `restore()` never calls its `rpc` function when
  `companyId` is missing, the format version is unsupported, or the schema is
  incomplete — and does call it only when everything validates clean.
- **Orchestration** (new this milestone, using a fake provider so these checks are pure
  coordination logic, independent of the algorithm simulator above): correct call
  ordering, `preview()` always runs even when validation fails, `recordCount` sums the
  preview's row counts, `progressTracker` reaches 100% on a full run, a plain thrown
  `Error` is normalized into the history entry without escaping as an unhandled
  rejection, an already-normalized provider error passes through unwrapped rather than
  being double-wrapped, a pre-aborted signal stops the pipeline before any provider
  method runs, a signal aborted *between* `preview()` and `restore()` lets preview
  complete but blocks restore, and a structurally corrupt archive (fails inside the
  parser itself) is normalized rather than thrown.
- **Parser round-trip**: `formatBackupArchive()` → `parseBackupArchive()` reconstructs
  every table byte-for-byte; a hand-built archive missing a table file entirely (bypassing
  the formatter, which never omits one) confirms the parser leaves that key genuinely
  absent from the snapshot rather than fabricating `null`/`[]`, and that
  `validateSchema()` correctly catches every table such an archive is missing.

Regression, run the same way immediately afterward: `dataExchange.test.html` (9A)
**43/43**, `xmlImport.test.html` (9B) **83/83**, `xmlExport.test.html` (9C) **65/65**,
`apnabill.test.html` (9D) **49/49** — all unchanged, zero regressions.

**Not verified**: `restore_company_from_snapshot()`'s actual execution against a live
Supabase project, and `apnabillRestoreProvider.js`'s real `defaultRpc()` path (dynamic
import of `supabaseClient.js` + a real `supa.rpc()` call) — no database credentials are
reachable from this environment, the same limitation noted in every prior milestone's
report.

## 6. Known limitations

- **`restore_rpc.sql` has never run against a live database.** Every insertion-order and
  foreign-key claim in §3 was derived by hand from `schema.sql`, not verified by actually
  executing the function.
- **No ZIP compression-corruption case beyond what 9D's `zipReader.js` already catches**
  — restore inherits 9D's reader as-is; nothing new was added on the read side for this
  milestone.
- **Disaster Recovery Restore does not exist.** Explicitly scoped out during this
  milestone's design review: full replacement of an *existing*, non-empty company (wipe +
  restore + rollback-on-any-failure, without the "must already be empty" precondition) is
  a materially higher-blast-radius operation than what this milestone builds, and needs
  its own explicit confirmation flow one layer up before it should exist at all — not a
  simple removal of the emptiness check in `restore_rpc.sql`.
- **Cancellation is a hook, not a feature** (§2): it can only stop the pipeline between
  stages, never interrupt an RPC call already in flight, and reuses `HISTORY_STATUS.FAILED`
  rather than a dedicated status.
- **`rollback()` is a no-op** by design for this restore mode (§4) — there is currently no
  way to undo a *successfully completed* New Company Restore other than restoring a
  different (or no) backup into the same company again by hand.
- **Only one archive format version has ever existed** (`1.0.0-apnabill-archive`), so
  `validateVersion()`'s "reject a different major, warn on a newer minor/patch" logic has
  never been exercised against a genuinely different real version — only synthetic
  version objects in the test harness.

## 7. Remaining work

- **Live-RPC verification of `restore_company_from_snapshot()`** against an actual
  Supabase project — the single highest-value remaining gap, given this function performs
  the first multi-table write in the entire Data Exchange Platform.
- **Disaster Recovery Restore**, as its own explicitly-scoped milestone, including the
  confirmation-flow design work its higher blast radius requires.
- **A settings/restore UI screen** — none exists in this codebase (consistent with every
  prior milestone's own finding); `runApnaBillRestore()` is UI-independent and ready to be
  called from one, including wiring its `preview` output into a real "review before you
  restore" screen and its `signal` option into a real Cancel button.
- **A complete cancellation feature**, if ever prioritized: threading an `AbortSignal`
  into the actual `supa.rpc()` call (not just between-stage checks), and likely a
  dedicated `HISTORY_STATUS.CANCELLED` value rather than reusing `FAILED` + a side flag.
- **A real ZIP reader stress test against a corrupted live-downloaded `.apnabill` file**
  — today's coverage of `zipReader.js`'s corruption-handling (9D) plus this milestone's
  parser tests are both synthetic, hand-corrupted inputs, never a real file that failed to
  download completely or was altered by an intermediary.

## 8. Assumptions made

- **"Restore" in this milestone means "New Company Restore" specifically** — approved
  explicitly during this milestone's design review, distinct from 9C's own report, which
  referred to "9D (Backup & Restore)" as one combined future milestone; this repo's actual
  branch/commit history treats Backup (9D) and Restore (9E) as two separate pieces of work,
  with Disaster Recovery Restore deferred further still.
- **The 17-vs-4 table split (§3) is the correct interpretation of "empty company"** for
  this app's actual `create_company()` seeding behavior — confirmed by direct reading of
  `schema.sql`, not assumed.
- **Preserving original row ids (not regenerating new UUIDs) is required for restore
  fidelity** — every foreign key in the snapshot depends on it; regenerating ids would
  require rewriting every cross-table reference, which the archive format doesn't carry
  enough information to reconstruct reliably (§4 of `docs/milestone-9d-backup-report.md`
  notes the same "preserve, never fabricate" principle on the write side).
- **A no-op `rollback()` is an honest implementation of the contract for this restore
  mode**, not a placeholder to be silently filled in later without discussion — any future
  change to this behavior should be a deliberate design decision, not an incidental one.
