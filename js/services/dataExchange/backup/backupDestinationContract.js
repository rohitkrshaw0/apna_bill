// backup/backupDestinationContract.js
// Interfaces only -- no destination implementation in this file. A backup
// destination is "where the finished archive bytes go" -- completely
// decoupled from IBackupProvider (backupContract.js), which only ever
// produces a Blob and knows nothing about where it ends up. Local disk,
// Supabase Storage, Google Drive, Dropbox, and S3 are all equally valid
// implementations of this one shape; the archive format itself never
// changes based on which one is used (see Milestone 9D's design doc).
//
// @typedef {Object} IBackupDestination
// @property {function(Blob, object): Promise<{location: string, uploadedAt: string}>} upload
// @property {function(string): Promise<Blob>} [download]     -- optional
// @property {function(): Promise<object[]>} [list]            -- optional
// @property {function(string): Promise<void>} [delete]         -- optional

import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CODES, ERROR_CATEGORY } from '../shared/errors/index.js';

const REQUIRED_METHODS = ['upload'];

export function assertValidBackupDestination (candidate) {
  const missing = REQUIRED_METHODS.filter(m => typeof candidate?.[m] !== 'function');
  if (missing.length) {
    throw createDataExchangeError({
      message: `Backup destination is missing required method(s): ${missing.join(', ')}`,
      code: ERROR_CODES.INVALID_CONTRACT,
      category: ERROR_CATEGORY.SYSTEM,
      source: 'backup/backupDestinationContract'
    });
  }
  return true;
}

export function createBaseBackupDestination (overrides = {}) {
  return {
    upload: () => { throw new Error('upload() not implemented'); },
    download: undefined,
    list: undefined,
    delete: undefined,
    ...overrides
  };
}
