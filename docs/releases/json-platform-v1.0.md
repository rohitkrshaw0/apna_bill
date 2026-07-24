# Release: json-platform-v1.0

**Tag:** `json-platform-v1.0` · **Commit:** `c55591f` (merge of PR #3,
`milestone-10-json-universal-exchange` → `master`) · **Date:** 2026-07-24

This is a release checkpoint document, not a design document. It records the state of
the repository at this tag for anyone picking up work afterward. For design rationale
and build/verification detail, see `docs/milestone-10-json-design.md` and
`docs/milestone-10-json-report.md` — not repeated here.

## Release Summary

Milestone 10 (Universal JSON Data Exchange Platform) is merged into `master` and
tagged. Canonical JSON is now ApnaBill's official, format-neutral interchange schema
alongside Tally XML, implemented as two new Migration Engine adapters. This release
introduces no database schema change, no public API change, and no network/cloud
functionality — everything is local-only. Full regression: **475/475 passing** (366
carried over unmodified from `migration-engine-v1.0` + 109 new).

## Major Features

- **JSON Export** (`runJsonExport()`, `js/services/dataExchange/json/export/`) — whole-
  company or selective (`scope`/`entities`) export of item/customer/supplier/sale data
  into one canonical, versioned JSON envelope. Pretty and compact serialization modes,
  both checksum-identical. Deterministic, repeatable output (key-sorted canonical
  serialization).
- **JSON Import** (`buildJsonImportPlan()` + `createJsonImporter()`,
  `js/services/dataExchange/json/import/`) — structural + schema-compatibility +
  checksum validation, business-rule validation, conflict detection, dry-run/preview,
  dependency-ordered execution with LIFO rollback. Reference resolution is always by
  name against the target company, never a foreign source-company database id, so one
  exported file is safely re-importable into a different ApnaBill company.
- Both adapters run through the **existing, unmodified** `createMigrationEngine()` —
  planning, validation sequencing, conflict resolution, progress reporting, execution,
  rollback, history, and error normalization are all reused, not reimplemented.

## Architecture Changes

None to the Migration Engine, XML engine, or `.apnabill` engine — confirmed by `git diff`
across this release showing zero lines changed under `migration/`, `xml/`, or
`apnabill/`. The only structural addition is a new, self-contained third format-engine
folder, `json/`, following the same barrel/module-map convention `xml/` and `apnabill/`
already established. `docs/data-exchange-architecture.md` was updated (new §7a,
module map, extension-point notes) to document this as a permanent architectural
reference, not a temporary note.

One disclosed, deliberate architectural exception: `json/shared/checksum.js` imports
`crc32`/`crc32Init`/`crc32Update`/`crc32Finalize` directly from `apnabill/zip/crc32.js`
rather than duplicating or relocating it. Verified during this milestone to be a pure,
zero-business-knowledge primitive (confirmed by direct inspection, not assumption) —
left exactly where it is; promoting it into `shared/` is deferred to a future
refactoring milestone rather than bundled into this one, since it carries no business
value on its own and would add regression surface to a tested backup file for a purely
cosmetic move.

## Regression Status

| Suite | Result |
|---|---|
| `dataExchange.test.html` (9A) | 43/43 ✅ |
| `xmlImport.test.html` (9B) | 83/83 ✅ |
| `xmlExport.test.html` (9C) | 74/74 ✅ |
| `apnabill.test.html` (9D) | 49/49 ✅ |
| `apnabillRestore.test.html` (9E) | 69/69 ✅ |
| `migration.test.html` (9F) | 48/48 ✅ |
| `json/jsonExport.test.html` (10) | 54/54 ✅ |
| `json/jsonImport.test.html` (10) | 55/55 ✅ |
| **Total** | **475/475 ✅** |

Re-run directly against the merged `master` HEAD (`c55591f`) as part of this release
checkpoint, via `python -m http.server` + headless Chrome `--dump-dom`, the same
zero-build-step harness convention every prior milestone uses. No suite skipped, no
suite modified for this checkpoint.

## Known Limitations

- JSON's entity scope is `item`/`customer`/`supplier`/`sale` only — matching, not
  exceeding, what XML import/export already supports end-to-end. Purchase/
  Manufacturing/Stock/Settings DTOs exist under `dto/` since Milestone 9A but are
  consumed by no format engine yet.
- `MAX_JSON_BYTES` (200MB cap) is exported but not exercised by an actual oversized
  file in the test suite — the cap and comparison logic are simple enough that this
  gap is disclosed rather than hidden, not considered a release blocker.
- No real, app-wide `applicationVersion` constant exists anywhere in this codebase
  (confirmed directly: no `package.json`, no `VERSION` file). `getApplicationVersion()`
  declares a minimal marker for this field rather than fabricating a number.
- Neither XML nor JSON restore/import paths support anything beyond the app's existing
  real business writers — no new business logic was introduced by this milestone.

## Technical Debt

- Purchase/Manufacturing/Stock/Settings entity support for JSON (and, symmetrically,
  for XML, which also lacks it) — a clean, additive future milestone; no engine or
  schema change anticipated.
- `apnabill/zip/crc32.js` remains under `apnabill/zip/` despite now having a second
  consumer (`json/`) — promotion to `shared/` deferred, see Architecture Changes above.
- No app-wide version constant to back `generator.applicationVersion` with a real
  number.
- No large-file stress test for JSON import's byte cap.

None of the above are release blockers; all were already disclosed in
`docs/milestone-10-json-report.md` §10 at merge time.

## Repository State

Verified directly as part of this checkpoint (2026-07-24), against `master` at
`c55591f`:

- **`git status`**: clean — no uncommitted changes, no untracked files (aside from the
  local, gitignored `.claude/` tool directory).
- **No generated, temporary, or debug artifact files** tracked anywhere in the repo
  (`.tmp`/`.bak`/`.orig`/scratch files: none found).
- **No `TODO`/`FIXME` placeholders** anywhere under `js/`.
- **No accidental `console.log`/`console.debug` calls** — the single `console.log` in
  the entire `js/` tree is inside `shared/logging/consoleSink.js`, the platform's own
  designated, pluggable logging sink (by design — the logger itself never calls
  `console` directly; only this one injectable sink implementation does).
- **No commented-out production code blocks** found in the files added this milestone.
- **All 13 files added under `json/` this milestone are git-tracked**, matching the
  working tree exactly (`git ls-files` cross-checked against the filesystem).
- **Tag `json-platform-v1.0`** exists, is annotated, and points at exactly `master`'s
  current HEAD (`c55591f`) — no drift between the tag and the branch tip.
- **No merge conflicts** — the merge to `master` was a clean fast-forward-eligible
  merge commit (`c55591f`), already landed.
- **One stale, fully-merged branch found and left untouched, not deleted**:
  `milestone-10-json-universal-exchange` still exists both locally and on `origin`.
  `git branch -r --no-merged origin/master` confirms it carries zero commits master
  doesn't already have — safe to delete whenever the user chooses, but this checkpoint
  is verification-only and does not delete it unilaterally.
- **One pre-existing, unrelated documentation issue found** (not introduced by this
  milestone, not fixed by this checkpoint per its explicit read-only scope):
  `docs/milestone-9e-restore-report.md` references `docs/milestone-9e-progress.md`
  twice; that file does not exist anywhere in the repository's history reachable from
  this checkpoint. Flagged for the user's awareness, left as-is.
- **No `README` exists anywhere in the repository** (root or otherwise) — there was
  nothing for this checkpoint's "verify README links" step to check against. Flagged,
  not created, since adding one is a new-content decision outside this checkpoint's
  verification-only scope.
- **Milestone numbering**: `docs/` contains 8.1–8.3, 8.5 (8.4/8.6 absent — pre-existing,
  unrelated to Milestone 10, not investigated further per this checkpoint's scope),
  9A–9F, and now 10. No duplicate or out-of-sequence milestone numbers found for
  Milestone 9/10 work.

## Future Milestones

Per `docs/data-exchange-architecture.md` §16 (updated this release) and
`docs/milestone-10-json-report.md` §10, still open and unaffected by this release:

- Purchase/Manufacturing/Stock/Settings entity coverage (JSON and XML alike).
- CSV/Excel import/export (JSON now provides a second worked template alongside XML).
- Cloud Backup, Incremental Backup, Disaster Recovery Restore, Sync — all explicitly
  out of scope since Milestone 9F, unaffected by Milestone 10.
- Promoting `apnabill/zip/crc32.js` to `shared/` as a standalone cleanup.

## Recommendation

The repository is clean, fully regression-tested at the tagged commit, and contains no
uncommitted, generated, or debug artifacts. The two items above (stale merged branch,
pre-existing dangling doc link) are informational only — neither blocks the next
milestone. **The repository is ready for the next architecture milestone.**
