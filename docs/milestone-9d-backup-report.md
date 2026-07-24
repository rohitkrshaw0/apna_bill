# Milestone 9D — ApnaBill Backup Engine: Backup Report

Deliverables document for the ApnaBill backup engine, built on Milestone 9A's Data
Exchange Platform (`backup/backupContract.js`, `backup/backupTypes.js`) exactly the way
9B/9C built the XML import/export engines on the same platform's parser/exporter/
formatter contracts. Scope for this milestone/branch (`milestone-9d-apnabill-backup`) is
**Backup only** — Restore is a separate, not-yet-started milestone; see §7.

## 1. What was built

```
backup_rpc.sql                              generate_company_backup_snapshot(_company_id)
                                             -- the Tier-1 consistency mechanism, §4

js/services/dataExchange/
  backup/
    backupTypes.js                          (9A, unmodified) BACKUP_TYPES enum
    backupContract.js                       (9A, unmodified) IBackupProvider contract
    backupDestinationContract.js            NEW (9D): IBackupDestination contract
    destinations/
      localDiskBackupDestination.js         NEW: browser-download IBackupDestination impl
    index.js                                extended: +destination contract, +local-disk destination

  apnabill/                                 NEW: the .apnabill archive format engine
    zip/
      crc32.js                              generic CRC-32 primitive (IEEE 802.3/ZIP/PNG/gzip)
      zipWriter.js                          generic ZIP (STORE method) archive builder
      zipReader.js                          generic ZIP (STORE method) reader, CRC-verifies every entry
    apnabillArchiveFormatterV1.js           snapshot -> named JSON entries -> ZIP bytes (IFormatter)
    apnabillBackupProvider.js               RPC read -> format -> verify (via zipReader.js) -> finalize (IBackupProvider)
    apnabillBackup.js                       runApnaBillBackup() -- provider + destination orchestration
    index.js                                public barrel
    apnabill.test.html                      offline test harness (49 checks)

docs/milestone-9d-backup-report.md          this document
```

13 new files, 1 modified (`backup/index.js`, purely additive — two new export lines). No
existing file outside `js/services/dataExchange/` was touched; no schema change (`backup_rpc.sql`
is additive-only, confirmed by its own header comment: no new tables/columns/constraints).
`restore/` (9A) is untouched — confirmed by `git status`, nothing under that folder appears.

## 2. Architecture

```
Supabase RPC -> Snapshot (jsonb) -> Formatter -> ZIP bytes -> Destination
     (Tier 1)      |                    |            |            |
                    |                    |            |     localDiskBackupDestination
                    |                    |     zipWriter.js (generic, STORE method)
                    |             apnabillArchiveFormatterV1.js (business-specific: table names,
                    |                                             manifest.json, versioning)
             generate_company_backup_snapshot()
```

- **Provider** (`apnabillBackupProvider.js`) implements 9A's `backupContract.js`
  `IBackupProvider` (`prepare`/`backup`/`verify`/`finalize`). `backup()` is the only place
  that talks to Supabase — imported dynamically (`await import('../../../supabaseClient.js')`),
  mirroring 9B/9C's own fix for the same issue: nothing that merely *imports* this module
  (including a future offline test harness) requires network access; only actually
  calling `backup()` does.
- **Formatter** (`apnabillArchiveFormatterV1.js`) implements 9A's `formatters/contract.js`
  `IFormatter`. This is the one file under `apnabill/` that knows what a "company" or
  "invoice" table even is — it owns the manifest shape, the per-table JSON file naming,
  and the format-version stamp (§3).
- **Writer/Reader** (`zip/zipWriter.js`, `zip/zipReader.js`, `zip/crc32.js`) are pure,
  generic primitives with zero business or even archive-format knowledge (`crc32.js`) /
  zero business knowledge (`zipWriter.js`/`zipReader.js`, know ZIP structure but not table
  names) — exactly the same writer/formatter split 9C established between
  `tallyXmlWriter.js` and `tallyXmlFormatterV1.js`. `zipReader.js` re-verifies every
  entry's CRC-32 as it reads (via `crc32.js`) and throws a plain `Error` on any structural
  problem (bad signature, unsupported compression method, size mismatch, truncated data,
  CRC mismatch) — `apnabillBackupProvider.js`'s `verify()` is what turns that into this
  platform's own `ValidationResult` shape, one layer up.
- **Destination** (`backup/destinations/localDiskBackupDestination.js`) implements 9A's
  `backupDestinationContract.js` `IBackupDestination`. Deliberately lives under `backup/`,
  not `apnabill/` — a destination only ever sees a `Blob`, never an archive format's
  internals, so it's shared infrastructure any future backup provider (not just
  apnabill's) can reuse.
- **Orchestration** (`apnabillBackup.js`, `runApnaBillBackup()`) wires provider and
  destination together: `prepare -> backup -> verify -> (if valid) upload -> finalize ->
  history entry`. Unlike 9C's `runXmlExport()` — which stops at producing formatted text
  and leaves the actual `download()` call to a future UI screen — a backup's entire
  purpose is reaching a destination, so this layer calls `destination.upload()` itself.
  Both dependencies are injectable (`opts.provider`/`opts.destination`), defaulting to the
  real ones, mirroring `runXmlExport({formatter, exporter})`'s testability pattern.

## 3. The `.apnabill` archive format

A `.apnabill` file is an ordinary ZIP archive (any unzip tool, Windows Explorer included,
opens it — verified directly, see §6) containing:

- `manifest.json` — `{ formatVersion, companyId, generatedAt, files: [...] }`, read first by
  a future Restore engine before it trusts anything else in the archive.
- One JSON file per table, named `<table>.json`, for all 21 tables
  `generate_company_backup_snapshot()` returns (`company`, `firms`, `parties`, `items`,
  `item_custom_field_defs`, `item_custom_field_values`, `batches`, `stock_ledger`,
  `payment_types`, `invoice_prefixes`, `invoices`, `invoice_lines`, `payments`,
  `purchases`, `purchase_lines`, `manufacturing_runs`, `manufacturing_lines`,
  `loyalty_transactions`, `print_settings`, `audit_log`, `invoice_attachments`).
  `company` is a single JSON object; every other file is a JSON array, matching the RPC's
  own per-key shape.

**STORE method (no compression), deliberately.** No compression library exists anywhere
in this browser codebase, and introducing one (a new dependency, or a hand-rolled
DEFLATE) for a feature whose entire content is already-compact JSON text was judged not
worth the complexity for this milestone. `zipWriter.js`'s own header comment records this
as an explicit, revisitable choice, not an oversight.

**No ZIP64.** A company backup is per-tenant JSON, not a multi-gigabyte archive, so the
classic 32-bit ZIP limits (4GB per file/archive, 65,535 entries) are not a real
constraint for this data shape — also recorded directly in `zipWriter.js`.

`formatVersion` is `1.0.0-apnabill-archive` (`shared/version/`'s existing `createVersion`,
confirmed unmodified since 9A — same framework 9C's Tally-XML formatter already uses for
its own version stamp). Table list and order in `apnabillArchiveFormatterV1.js` are kept
byte-identical to `backup_rpc.sql`'s `jsonb_build_object` key order specifically so the two
files can be diffed against each other whenever the schema changes.

## 4. Consistency guarantee

**Tier 1 (built): one `REPEATABLE READ` transaction.**
`generate_company_backup_snapshot()` sets `SET TRANSACTION ISOLATION LEVEL REPEATABLE
READ` as the first statement in its body (must run before even the authorization check,
per Postgres's own rule that it be the transaction's first statement), then reads all 21
tables inside that one snapshot. A sale, payment, or stock change committed anywhere else
during the read is invisible to every query in the function — never a torn combination
like "new invoice, old payment count." The function also performs one write (an
`audit_log` insert recording the backup event) inside the same transaction, which is why
`READ ONLY` was deliberately **not** also set: it applies to the whole transaction and
would reject that write outright; `REPEATABLE READ` alone already gives every read the one
frozen snapshot the consistency design requires, and a plain `INSERT` of a brand-new row
cannot conflict with anything else under `REPEATABLE READ` (unlike `UPDATE`/`DELETE`, it
never risks a serialization failure), so mixing it into an otherwise read-only snapshot
transaction is safe.

**Tier 2 (documented fallback, not built): staging-table materialization.** If
`SET TRANSACTION ISOLATION LEVEL` as an RPC's first statement is ever rejected in
practice (untested from this environment — no live Supabase project reachable, §6), the
fallback is to have the RPC first `INSERT ... SELECT` all 21 tables' current rows into a
temporary staging table (scoped to the calling transaction), then build the same `jsonb`
result by reading only from that staging table. Because the staging table is populated
and read within one ordinary transaction and nothing else can see or write to it, this
achieves the same "one frozen view of everything" guarantee under plain `READ COMMITTED`
semantics, at the cost of one extra write+read pass over 21 tables' worth of data. This
tier has not been implemented — Tier 1 has hit no obstacle that would require it — but is
recorded here so a future maintainer doesn't have to re-derive it if Tier 1 ever needs
replacing.

## 5. Contract conformance — did 9A's contracts survive a real implementation?

9C's own architecture audit (§12, finding #7.4) flagged that `backup/backupContract.js`
and `restore/restoreContract.js` had gone three milestones without a single real
implementation testing them, and predicted 9D "should expect to renegotiate
`backupContract.js` against real implementation constraints." In practice, for the
`IBackupProvider` half: **no renegotiation was needed.** `prepare(context)` /
`backup(context)` / `verify(candidate)` / `finalize()` mapped directly onto "record which
company, call the RPC, check the output before trusting it, report what happened" without
forcing any shape change. `backupDestinationContract.js`'s `IBackupDestination`
(`upload` required, `download`/`list`/`delete` optional) also held up directly:
`localDiskBackupDestination.js` implements exactly `upload`, and the optional methods stay
genuinely absent (not stubbed) because a browser-triggered download has no path back to
the app for this destination to read, enumerate, or delete against — confirmed this is a
property of the *destination*, not a contract gap, since a future Supabase Storage
destination could legitimately implement all four.

One real adjustment: neither contract's typedef specifies `async`/`await`, but `backup()`
must be async (it awaits an RPC round-trip) — the same pragmatic reinterpretation 9C's
audit already noted for `parsers/contract.js`/`exporters/contract.js` needing to become
async once real implementations were built against them. `assertValidBackupProvider()`
only checks `typeof candidate[method] === 'function'`, which an `async function` still
satisfies, so this required no contract file edit, only an implementation-side choice.

## 6. Verification performed

`apnabill/apnabill.test.html` — **49/49 checks passed**, run headlessly, fully offline
(no live Supabase touched), same convention as 9A/9B/9C's harnesses:

```
python -m http.server 8743
chrome --headless=new --disable-gpu --virtual-time-budget=8000 --dump-dom \
  http://localhost:8743/js/services/dataExchange/apnabill/apnabill.test.html
```

Two things are deliberately **not** exercised by this harness, both documented directly in
its own header comment, matching precedent already set by 9C's harness (which never calls
`dataReaders.js`'s/`xmlExporter.js`'s live-Supabase functions, nor `download.js`, either):

- **`apnabillBackupProvider.js`'s `backup()`** — it dynamically imports
  `supabaseClient.js` and calls a real RPC; no credentials are reachable from this
  environment. Covered instead by direct `verify()`/`finalize()`/contract-shape checks.
- **`localDiskBackupDestination.js`'s `upload()`** — it creates a real `<a download>` and
  calls `.click()`, which would trigger an actual browser download as a side effect of
  running the test suite. Covered instead by an `assertValidBackupDestination()` /
  required-methods check.

`zipReader.js`, by contrast, **is** exercised for real, not stubbed: every
`zipWriter.js`/`apnabillArchiveFormatterV1.js` round-trip check reads back through the
actual `readZip()`, and a dedicated section deliberately mutates valid archives to confirm
it rejects what it should — a single corrupted data byte (caught via CRC-32 mismatch, not
silently accepted), a compression-method field flipped to DEFLATE (rejected as
unsupported — this reader only ever handles STORE), a truncated archive (EOCD missing
entirely), too-short input, non-ZIP bytes entirely, and — the positive case — a trailing
archive comment (a real ZIP feature this codebase's own writer never produces) correctly
located by searching backward rather than assuming "EOCD is always the last 22 bytes."

Coverage otherwise: `crc32.js` against the standard CRC-32/ISO-HDLC check value for
`"123456789"` (`0xCBF43926` — an independent correctness reference, not just internal
self-consistency) plus chunked-vs-one-shot equivalence; `zipWriter.js`'s output confirming
entry names/content/CRC-32/nested-path/empty-file round-trip correctly and a zero-entry
archive stays structurally valid; `apnabillArchiveFormatterV1.js` producing all 22 files
(manifest + 21 tables) with correct `manifest.json` content, a single-object `company.json`
vs. array-shaped table files, `null`-not-fabricated handling for both an explicitly-null
company and an entirely-missing table key, and byte-identical determinism across two runs
of the same input; `apnabillBackupProvider.js`'s `verify()` against a clean result, a
missing-table result, a corrupted-archive result (now genuinely CRC-checked via
`readZip()`, not just a signature byte), a null result, and a missing-company (warning,
not error) result; `localDiskBackupDestination.js`'s contract shape; and
`runApnaBillBackup()`'s full orchestration — call order, upload skipped on failed
verification, correct history entry status, correct default/explicit filenames — using
injected fake provider/destination.

Regression, run the same way, unchanged: `xmlExport.test.html` (9C) **65/65 passed**;
`xmlImport.test.html` (9B) **83/83 passed**; `dataExchange.test.html` (9A) **43/43
passed**.

**Not verified**: `backup()`'s actual RPC call against a live Supabase project, and
`upload()`'s actual browser download — no database credentials are reachable from this
environment (same limitation noted in every prior milestone's report and in
`backup_rpc.sql`'s own header comment), and a real download is an intentional side effect
this harness avoids triggering.

## 7. Known limitations

- **`verify()`'s structural check trusts `readZip()`'s own scope.** It now genuinely
  parses the central directory and CRC-verifies every entry (§6) — a real improvement
  over the earlier signature-byte-only check — but `readZip()` only understands STORE
  (method 0), which is all this platform ever writes; it does not (and doesn't need to)
  understand DEFLATE or any other ZIP compression method.
- **`backup_rpc.sql` has never run against a live database** (§6) — the `REPEATABLE READ`
  approach is standard Postgres practice but unverified in this specific Supabase
  environment; Tier 2 (§4) is the documented fallback if it's ever rejected.
- **Only one destination exists** (`localDiskBackupDestination.js`, browser download).
  `BACKUP_TYPES.CLOUD` (9A's enum) has no implementation — a Supabase Storage, Drive, or
  Dropbox destination is future work.
- **Only one archive format exists.** `BACKUP_TYPES.JSON` (a single JSON file, no ZIP) and
  `BACKUP_TYPES.INCREMENTAL` (delta-only backups) are both defined in 9A's enum and both
  unimplemented — this milestone only builds the `ZIP`-shaped `.apnabill` format.
- **No encryption.** The archive is plain JSON in a plain ZIP; anyone who obtains the file
  can read every table's contents.
- **No restore counterpart.** This milestone is Backup only (per the branch name and §1);
  9A's `restore/restoreContract.js` (`validateVersion`/`validateSchema`/
  `validateCompatibility`/`preview`/`restore`/`rollback`) remains entirely unimplemented,
  same as it has been since 9A.
- **Large companies**: `generate_company_backup_snapshot()` builds its entire `jsonb`
  result in one query across 21 tables before returning — there is no pagination or
  streaming, unlike 9C's `dataReaders.js`, which paginates every read in 500-row pages
  specifically to avoid this. A company with a very large `invoice_lines` or `audit_log`
  history could produce a large single RPC payload; no size limit or chunking was added,
  matching this milestone's "don't build for hypothetical scale" scope, but this is a
  real divergence from 9C's own established pagination convention, worth revisiting if a
  large company's backup is ever reported slow or memory-heavy.

## 8. Remaining work

- **Restore milestone** (9E or similar): `restore/restoreContract.js`'s six methods,
  a concrete `apnabillRestoreProvider.js` reading a `.apnabill` archive (`zip/zipReader.js`
  now exists and is exactly the building block this needs — CRC-verified entries in,
  named-file-per-table out), version/compatibility checks against `manifest.json`'s
  `formatVersion` (`shared/version/compatibility.js` already exists and is unused by
  anything real, same finding 9C's audit made about `backup/`/`restore/` generally), and a
  preview-before-restore flow reusing 9A's existing `preview/` folder.
- **A Supabase Storage (or other cloud) destination**, giving `BACKUP_TYPES.CLOUD` its
  first real implementation, injectable into `runApnaBillBackup({destination})` with zero
  changes to the provider or orchestration layer — this is exactly what
  `backupDestinationContract.js`'s pluggable-destination design was for.
- **Live-RPC verification of `backup_rpc.sql`**: fully written and reasoned through, never
  run against a live Supabase project from this environment (§6/§7) — same limitation
  noted in every prior milestone.
- **A settings/backup UI screen**: none exists in this codebase (consistent with 9B/9C's
  own findings); `runApnaBillBackup()` is UI-independent and ready to be called from one
  whenever it's built.

## 9. Assumptions made

- **"Backup" (this milestone) and "Restore" are separate milestones**, based on the
  branch name (`milestone-9d-apnabill-backup`) actually used for this work, even though
  9C's own report referred to "9D (Backup & Restore)" as one combined future milestone.
- **`company_members` is correctly excluded** from the snapshot (per `backup_rpc.sql`'s
  own comment) as access-control data, not business data restorable into a new or
  different company context — this was a design decision made when `backup_rpc.sql` was
  written, carried forward unquestioned here since no contradicting requirement exists.
- **A `.apnabill` file's `manifest.json` is the only versioning surface needed for now.**
  No per-table schema version is stamped — only one archive-format version — since a
  restore engine doesn't exist yet to consume anything finer-grained; this can be revisited
  when 9E is scoped.
- **STORE (no compression) is an acceptable trade-off**, not a permanent constraint —
  recorded as revisitable in `zipWriter.js`'s own header comment (§3) rather than treated
  as a settled architectural decision.
