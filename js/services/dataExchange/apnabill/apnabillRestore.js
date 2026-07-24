// apnabill/apnabillRestore.js
// Orchestrates the full New Company Restore pipeline: ZIP bytes -> parse ->
// validate (version + schema) -> preview -> (if valid, not cancelled)
// restore() -> HistoryEntry. Mirrors apnabillBackup.js's runApnaBillBackup()
// one layer above its pieces (parseBackupArchive, createApnaBillRestoreProvider) --
// this file introduces no business rule of its own. What "valid" means
// lives in apnabillRestoreProvider.js; what "empty company" means and what
// actually gets written lives in restore_rpc.sql; this file only sequences
// calls to those pieces, tracks progress, builds a history entry, and
// normalizes whatever they throw into a consistent result shape.
//
// Deliberately differs from runApnaBillBackup() in one way: that function
// lets a provider's exception propagate up uncaught (nothing in 9D's
// read-only pipeline needed to survive one). Restore writes data, so an
// uncaught exception here is a worse failure mode than a normalized
// "failed" result -- every stage below is wrapped, and any thrown error
// (a plain Error, a Postgres/PostgREST error object, or one of
// apnabillRestoreProvider.js's own createDataExchangeError() throws)
// becomes a warning/error entry on the returned validationResult/
// historyEntry instead of an unhandled rejection.
//
// provider is injectable (defaults to the real one), same pattern as
// runApnaBillBackup({provider, destination}) and runXmlExport({formatter,
// exporter}).

import { parseBackupArchive } from './apnabillArchiveParserV1.js';
import { createApnaBillRestoreProvider } from './apnabillRestoreProvider.js';
import { createProgressTracker } from '../progress/index.js';
import { createHistoryEntry, HISTORY_STATUS } from '../history/index.js';
import { createValidationResult } from '../validators/validationResult.js';
import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CODES, ERROR_CATEGORY } from '../shared/errors/index.js';
import { SEVERITY } from '../shared/severity.js';
import { parseVersion } from '../shared/version/index.js';

// One entry per pipeline stage, in order -- purely for progressTracker's
// currentRecord/totalRecords math, not a retry queue or anything stateful.
const STAGES = ['parse', 'validate', 'preview', 'restore'];

/** True only for objects that already look like createDataExchangeError()'s own shape -- avoids double-wrapping an error apnabillRestoreProvider.js already normalized itself. */
function isAlreadyNormalized (err) {
  return !!err && typeof err.message === 'string' && 'category' in err && 'severity' in err;
}

function normalizeError (err, source) {
  if (isAlreadyNormalized(err)) return err;
  return createDataExchangeError({
    message: (err && err.message) || String(err),
    code: ERROR_CODES.INVALID_VALUE,
    category: ERROR_CATEGORY.SYSTEM,
    source
  });
}

/**
 * Cancellation hook for future use: `opts.signal` is a standard
 * AbortSignal, checked only at stage boundaries below. This does NOT abort
 * an in-flight RPC call -- the real defaultRpc() inside
 * apnabillRestoreProvider.js isn't wired to any signal yet -- it only lets
 * a caller stop the pipeline BETWEEN stages (e.g. after seeing the preview,
 * before the actual write starts). A complete cancellation feature (one
 * that can interrupt a call already in flight) is future work.
 */
function throwIfCancelled (signal) {
  if (signal && signal.aborted) {
    const err = new Error('Restore was cancelled before completion');
    err.cancelled = true;
    throw err;
  }
}

function totalPreviewRowCount (previewModel) {
  if (!previewModel) return 0;
  return previewModel.items.reduce((sum, item) => sum + (item.dto?.rowCount || 0), 0);
}

/**
 * @param {object} opts { companyId, archiveBytes, provider, signal }
 * @returns {Promise<{manifest, snapshot, validationResult, previewModel, restoreResult, historyEntry, progressTracker, cancelled}>}
 */
export async function runApnaBillRestore (opts = {}) {
  const startedAt = Date.now();
  const provider = opts.provider || createApnaBillRestoreProvider();
  const progressTracker = createProgressTracker();
  progressTracker.update({ totalRecords: STAGES.length, currentRecord: 0 });

  function advance (stage) {
    progressTracker.update({ currentModule: stage, currentRecord: STAGES.indexOf(stage) + 1 });
  }

  let manifest = null;
  let snapshot = null;
  let previewModel = null;
  let restoreResult = null;
  let validationResult = createValidationResult();
  let cancelled = false;

  try {
    throwIfCancelled(opts.signal);
    ({ manifest, snapshot } = parseBackupArchive(opts.archiveBytes));
    advance('parse');

    const version = manifest && manifest.formatVersion ? parseVersion(manifest.formatVersion) : null;
    validationResult = provider.validateVersion(version).merge(provider.validateSchema(snapshot));
    advance('validate');

    previewModel = provider.preview({ manifest, snapshot });
    advance('preview');

    if (validationResult.isValid()) {
      throwIfCancelled(opts.signal);
      restoreResult = await provider.restore({ companyId: opts.companyId, manifest, snapshot });
    }
    advance('restore');
  } catch (err) {
    if (err && err.cancelled) {
      cancelled = true;
      validationResult = validationResult.merge(createValidationResult({
        warnings: [createDataExchangeError({
          message: err.message,
          code: ERROR_CODES.INVALID_VALUE, category: ERROR_CATEGORY.SYSTEM,
          severity: SEVERITY.WARNING, source: 'apnabill/apnabillRestore'
        })]
      }));
    } else {
      validationResult = validationResult.merge(createValidationResult({
        errors: [normalizeError(err, 'apnabill/apnabillRestore')]
      }));
    }
  }

  const isSuccess = !cancelled && validationResult.isValid() && !!restoreResult;
  progressTracker.update({ successCount: isSuccess ? 1 : 0, failureCount: isSuccess ? 0 : 1 });

  const historyEntry = createHistoryEntry({
    type: 'restore',
    timestamp: startedAt,
    durationMs: Date.now() - startedAt,
    recordCount: totalPreviewRowCount(previewModel),
    warnings: validationResult.warnings,
    errors: validationResult.errors,
    status: isSuccess ? HISTORY_STATUS.SUCCESS : HISTORY_STATUS.FAILED
  });

  return { manifest, snapshot, validationResult, previewModel, restoreResult, historyEntry, progressTracker, cancelled };
}
