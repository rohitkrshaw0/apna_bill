// apnabill/apnabillRestore.js
// Orchestrates the full New Company Restore pipeline: ZIP bytes -> parse ->
// validate (version + schema) -> preview -> (if valid) restore() ->
// HistoryEntry. As of Milestone 9F Phase 2, the orchestration itself is
// delegated to the Migration Engine (migration/migrationEngine.js) instead
// of being hand-written here -- this file now only describes RESTORE's
// shape as a MigrationAdapter: what "read" means (parseBackupArchive()),
// what "validate" means (provider.validateVersion() then
// provider.validateSchema(), run via the engine's own validators
// mechanism -- see below for why NOT the verify() hook), what "preview"
// means (provider.preview(), always computed, never gated on validity),
// what "write" means (provider.restore()), and that rollback is fully
// delegated to a single Postgres transaction (rollbackStrategy:
// 'delegated' -- provider.rollback() itself stays the documented no-op it
// already was).
//
// runApnaBillRestore()'s exported name, parameters, and return shape are
// UNCHANGED from before this migration. provider remains injectable
// exactly as before; `engine` is newly injectable too, for the same
// reason.
//
// WHY validateVersion/validateSchema are wired through adapter.validators
// (which the engine runs FIRST, before preview) rather than the verify()
// hook (which the engine runs AFTER preview, in 'pre' timing): the
// existing offline harness asserts an exact call order on the real
// provider -- validateVersion, validateSchema, preview, restore. The
// validators mechanism preserves that order exactly; verify() would not
// (it runs after preview). This is not a new business rule -- it is the
// engine's own, already-existing validators pipeline (validators/
// validationPipeline.js, unchanged), used here as the natural fit for
// what these two provider methods already are: DTO-level validation
// stages, not a bytes-level integrity check the way backup's verify() is.
//
// Cancellation is handled entirely by the engine's own, already-generic
// hooks (checked before source.read() and again before execute) -- this
// file adds no cancellation logic of its own, unlike the pre-migration
// version, which hand-rolled both checks.

import { parseBackupArchive } from './apnabillArchiveParserV1.js';
import { createApnaBillRestoreProvider } from './apnabillRestoreProvider.js';
import {
  createBaseMigrationAdapter, EXECUTION_MODES, ROLLBACK_STRATEGIES, createMigrationEngine
} from '../migration/index.js';
import { parseVersion } from '../shared/version/index.js';

function parsedVersionFromManifest (manifest) {
  return manifest && manifest.formatVersion ? parseVersion(manifest.formatVersion) : null;
}

function totalPreviewRowCount (previewModel) {
  if (!previewModel) return 0;
  return previewModel.items.reduce((sum, item) => sum + (item.dto?.rowCount || 0), 0);
}

/**
 * @param {object} opts { companyId, archiveBytes, provider, signal, engine }
 * @returns {Promise<{manifest, snapshot, validationResult, previewModel, restoreResult, historyEntry, progressTracker, cancelled}>}
 */
export async function runApnaBillRestore (opts = {}) {
  const provider = opts.provider || createApnaBillRestoreProvider();
  const engine = opts.engine || createMigrationEngine();

  // Captured via closure -- RESTORE-specific legacy return fields
  // (`manifest`, `snapshot`) that no other adapter needs, so they stay
  // adapter-local rather than becoming new engine concepts.
  let capturedManifest = null;
  let capturedSnapshot = null;
  let capturedPreviewModel = null;

  const adapter = createBaseMigrationAdapter({
    source: {
      read: async (context) => {
        const parsed = parseBackupArchive(context.archiveBytes);
        capturedManifest = parsed.manifest;
        capturedSnapshot = parsed.snapshot;
        return parsed;
      }
    },
    validators: [
      { validate: (dtoList) => provider.validateVersion(parsedVersionFromManifest(dtoList[0]?.manifest)) },
      { validate: (dtoList) => provider.validateSchema(dtoList[0]?.snapshot) }
    ],
    preview: (dtoList) => {
      capturedPreviewModel = provider.preview({ manifest: dtoList[0]?.manifest, snapshot: dtoList[0]?.snapshot });
      return capturedPreviewModel;
    },
    transform: {
      fromDTO: (dtoList) => dtoList[0]
    },
    sink: {
      write: async (unit, context) => provider.restore({ companyId: context.companyId, manifest: unit.manifest, snapshot: unit.snapshot })
    },
    executionMode: EXECUTION_MODES.SINGLE_SHOT,
    rollbackStrategy: ROLLBACK_STRATEGIES.DELEGATED,
    estimateChanges: () => ({ count: totalPreviewRowCount(capturedPreviewModel) }),
    historyType: 'restore'
  });

  const migrationResult = await engine.run(adapter, {
    context: { companyId: opts.companyId, archiveBytes: opts.archiveBytes },
    signal: opts.signal
  });

  return {
    manifest: capturedManifest,
    snapshot: capturedSnapshot,
    validationResult: migrationResult.validationResult,
    previewModel: migrationResult.previewModel,
    restoreResult: migrationResult.executionOutput,
    historyEntry: migrationResult.historyEntry,
    progressTracker: migrationResult.progressTracker,
    cancelled: migrationResult.cancelled
  };
}
