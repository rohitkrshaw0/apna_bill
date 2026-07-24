// migration/migrationResult.js
// The Migration Engine's one canonical result shape (Milestone 9F, approved
// design §16), replacing today's four independently-shaped return objects
// (runApnaBillBackup()'s {result, validationResult, uploadResult, summary,
// progressTracker, historyEntry}, runApnaBillRestore()'s {manifest,
// snapshot, validationResult, previewModel, restoreResult, historyEntry,
// progressTracker, cancelled}, and two more distinct shapes for XML import/
// export). Adapter-specific extra data travels in `details` rather than
// being lost or forcing every caller to special-case a different shape.
//
// Deliberately NOT deep-frozen, matching every existing orchestration
// function's own return value (none of them freeze their result either) --
// progressTracker legitimately keeps evolving (a caller may still call
// progressTracker.on() after receiving this) and freezing the container
// would invite confusion about whether that's still safe.

export function createMigrationResult ({
  plan = null, executionOutput = null, validationResult = null, previewModel = null,
  historyEntry = null, progressTracker = null, cancelled = false, details = {}
} = {}) {
  return { plan, executionOutput, validationResult, previewModel, historyEntry, progressTracker, cancelled, details };
}
