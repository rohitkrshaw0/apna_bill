// apnabill/apnabillBackup.js
// Orchestrates the full ApnaBill backup pipeline: Provider -> ZIP bytes ->
// Verify -> Destination -> HistoryEntry, mirroring 9C's xmlExporter.js
// orchestration layer one level above its pieces (createApnaBillBackupProvider,
// createLocalDiskBackupDestination). Unlike runXmlExport() -- which stops at
// producing formatted text and leaves the actual download() call to a future
// UI screen -- a backup's whole point is reaching a destination, so this
// layer calls destination.upload() itself rather than handing bytes back
// for someone else to store.
//
// provider/destination are injectable (default to the real ones) so tests
// can substitute fakes, same pattern as runXmlExport({formatter, exporter}).

import { createApnaBillBackupProvider } from './apnabillBackupProvider.js';
import { createLocalDiskBackupDestination } from '../backup/destinations/localDiskBackupDestination.js';
import { createProgressTracker } from '../progress/index.js';
import { createHistoryEntry, HISTORY_STATUS } from '../history/index.js';

const ARCHIVE_MIME_TYPE = 'application/zip';

function defaultFilename (companyId, generatedAt) {
  const stamp = String(generatedAt).replace(/[:.]/g, '-');
  return `apnabill-backup-${companyId}-${stamp}.apnabill`;
}

function totalRowCount (tableCounts = {}) {
  return Object.values(tableCounts).reduce((sum, count) => sum + count, 0);
}

/**
 * @param {object} opts { companyId, provider, destination, filename }
 * @returns {Promise<{result, validationResult, uploadResult, summary, progressTracker, historyEntry}>}
 */
export async function runApnaBillBackup (opts = {}) {
  const startedAt = Date.now();
  const provider = opts.provider || createApnaBillBackupProvider();
  const destination = opts.destination || createLocalDiskBackupDestination();

  provider.prepare({ companyId: opts.companyId });
  const result = await provider.backup({ companyId: opts.companyId });
  const validationResult = provider.verify(result);
  const isValid = validationResult.isValid();

  const progressTracker = createProgressTracker();
  progressTracker.update({
    totalRecords: 1, currentRecord: 1,
    successCount: isValid ? 1 : 0, failureCount: isValid ? 0 : 1
  });

  let uploadResult = null;
  if (isValid) {
    const blob = new Blob([result.bytes], { type: ARCHIVE_MIME_TYPE });
    const filename = opts.filename || defaultFilename(result.companyId, result.generatedAt);
    uploadResult = await destination.upload(blob, { filename });
  }

  const summary = provider.finalize();

  const historyEntry = createHistoryEntry({
    type: 'backup',
    timestamp: startedAt,
    durationMs: Date.now() - startedAt,
    recordCount: totalRowCount(summary.tableCounts),
    warnings: validationResult.warnings,
    errors: validationResult.errors,
    status: isValid ? HISTORY_STATUS.SUCCESS : HISTORY_STATUS.FAILED
  });

  return { result, validationResult, uploadResult, summary, progressTracker, historyEntry };
}
