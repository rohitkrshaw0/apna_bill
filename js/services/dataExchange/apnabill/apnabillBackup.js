// apnabill/apnabillBackup.js
// Orchestrates the full ApnaBill backup pipeline: Provider -> ZIP bytes ->
// Verify -> Destination -> HistoryEntry. As of Milestone 9F Phase 2, the
// orchestration itself (plan/validate/execute/report sequencing) is
// delegated to the Migration Engine (migration/migrationEngine.js) instead
// of being hand-written here -- this file now only describes BACKUP's
// shape as a MigrationAdapter: what "read" means (provider.prepare()+
// backup()), what "verify" means and when (provider.verify(), BEFORE the
// destination is ever touched), what "write" means (destination.upload()),
// and that there is nothing to roll back (rollbackStrategy: 'none' --
// backup is read-plus-one-audit-insert, never a multi-step write).
//
// runApnaBillBackup()'s exported name, parameters, and return shape are
// UNCHANGED from before this migration -- every existing caller (including
// apnabill.test.html's orchestration checks) works without modification.
// provider/destination remain injectable exactly as before; `engine` is
// newly injectable too, for the same reason (tests can substitute a fake).
//
// Two small, disclosed behavior differences from the pre-9F version, both
// confirmed to affect no existing test (apnabill.test.html never asserts
// progressTracker state, and neither provider.backup()'s missing-companyId
// throw nor destination.upload()'s hypothetical throw were ever exercised
// by any test -- backup()/upload() are explicitly out of this harness's
// offline scope per its own header comment) and no external caller
// (confirmed by repo-wide grep: nothing outside the dataExchange test
// harnesses calls this function):
//   1. A thrown error from provider.backup() or destination.upload() is now
//      caught and normalized into the returned validationResult/
//      historyEntry (status FAILED) instead of rejecting the whole
//      runApnaBillBackup() call. This is not incidental -- it is exactly
//      the error-normalization gap the approved design's §3.3 identified
//      as this platform's most concrete existing inconsistency (only
//      apnabillRestore.js had this before). Backup gains it for free.
//   2. On a FAILED verify (pre-execution gate), progressTracker is never
//      updated at all (stays at its pristine 0% state), rather than the
//      old code's unconditional "totalRecords:1, currentRecord:1,
//      failureCount:1" -- arguably more honest (nothing was ever
//      attempted), and untested either way before this change.

import { createApnaBillBackupProvider } from './apnabillBackupProvider.js';
import { createLocalDiskBackupDestination } from '../backup/destinations/localDiskBackupDestination.js';
import {
  createBaseMigrationAdapter, EXECUTION_MODES, ROLLBACK_STRATEGIES, createMigrationEngine
} from '../migration/index.js';
import { createHistoryEntry } from '../history/index.js';

const ARCHIVE_MIME_TYPE = 'application/zip';

function defaultFilename (companyId, generatedAt) {
  const stamp = String(generatedAt).replace(/[:.]/g, '-');
  return `apnabill-backup-${companyId}-${stamp}.apnabill`;
}

function totalRowCount (tableCounts = {}) {
  return Object.values(tableCounts).reduce((sum, count) => sum + count, 0);
}

// Generic over whatever keys the snapshot happens to contain -- no table-name
// knowledge needed (avoids yet another copy of the table list this platform
// already has too many of). Used only for the engine's own internal Plan
// bookkeeping (plan.estimatedChanges), computed in the Plan phase, BEFORE
// verify() runs. The legacy `historyEntry.recordCount` field below is
// deliberately NOT sourced from this -- it still comes from
// provider.finalize()'s own authoritative tableCounts, exactly as before
// this migration, since finalize() is the provider's one designated source
// of truth for "what did this backup actually contain."
function estimateRowCount (snapshot = {}) {
  return Object.values(snapshot).reduce((sum, v) => sum + (Array.isArray(v) ? v.length : (v ? 1 : 0)), 0);
}

/**
 * @param {object} opts { companyId, provider, destination, filename, engine }
 * @returns {Promise<{result, validationResult, uploadResult, summary, progressTracker, historyEntry}>}
 */
export async function runApnaBillBackup (opts = {}) {
  const provider = opts.provider || createApnaBillBackupProvider();
  const destination = opts.destination || createLocalDiskBackupDestination();
  const engine = opts.engine || createMigrationEngine();

  // Captured via closure rather than plumbed through the engine's generic
  // MigrationResult shape -- these are BACKUP-specific fields the legacy
  // return shape requires (`result`, `summary`) that no other adapter needs,
  // so they stay adapter-local rather than becoming new engine concepts.
  let capturedResult = null;
  let capturedSummary = null;

  const adapter = createBaseMigrationAdapter({
    source: {
      read: async (context) => {
        provider.prepare({ companyId: context.companyId });
        capturedResult = await provider.backup({ companyId: context.companyId });
        return capturedResult;
      }
    },
    transform: {
      // dtoList is always a single-element array here (source.read() returns
      // one object, never an array) -- unwrap it back to the shape
      // destination.upload() and provider.verify() actually expect.
      fromDTO: (dtoList) => {
        const r = dtoList[0];
        const blob = new Blob([r.bytes], { type: ARCHIVE_MIME_TYPE });
        const filename = opts.filename || defaultFilename(r.companyId, r.generatedAt);
        return { blob, filename };
      }
    },
    sink: {
      write: async (unit) => destination.upload(unit.blob, { filename: unit.filename })
    },
    // Pre-execution: exactly mirrors the original ordering -- verify()
    // must pass BEFORE destination.upload() is ever attempted. finalize()
    // is called here too (not in estimateChanges, which runs earlier, in
    // the Plan phase) to preserve the exact prepare->backup->verify->
    // finalize call sequence the original code had.
    verify: (dtoList) => {
      const verifyResult = provider.verify(dtoList[0]);
      capturedSummary = provider.finalize();
      return verifyResult;
    },
    verifyTiming: 'pre',
    executionMode: EXECUTION_MODES.SINGLE_SHOT,
    rollbackStrategy: ROLLBACK_STRATEGIES.NONE,
    estimateChanges: (dtoList) => ({ count: estimateRowCount(dtoList[0]?.snapshot) }),
    historyType: 'backup'
  });

  const migrationResult = await engine.run(adapter, { context: { companyId: opts.companyId } });

  // Rebuilt with the legacy, provider.finalize()-derived recordCount --
  // the engine's own historyEntry (discarded here) used the Plan-phase
  // estimate instead, which exists only for the engine's internal
  // bookkeeping (see estimateRowCount's own comment above). Every other
  // field is carried straight through from the engine's result unchanged.
  const historyEntry = createHistoryEntry({
    type: migrationResult.historyEntry.type,
    timestamp: migrationResult.historyEntry.timestamp,
    durationMs: migrationResult.historyEntry.durationMs,
    recordCount: capturedSummary ? totalRowCount(capturedSummary.tableCounts) : 0,
    warnings: migrationResult.historyEntry.warnings,
    errors: migrationResult.historyEntry.errors,
    status: migrationResult.historyEntry.status
  });

  return {
    result: capturedResult,
    validationResult: migrationResult.validationResult,
    uploadResult: migrationResult.executionOutput,
    summary: capturedSummary,
    progressTracker: migrationResult.progressTracker,
    historyEntry
  };
}
