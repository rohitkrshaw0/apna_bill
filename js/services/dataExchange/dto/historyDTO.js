// dto/historyDTO.js
// The data shape of a history record when it flows through the pipeline
// (e.g. exporting history). history/historyEntry.js composes this rather
// than duplicating its fields -- this file owns the shape once.

import { createDTO } from './baseDTO.js';

export function createHistoryDTO ({
  type, timestamp = Date.now(), durationMs = 0, recordCount = 0,
  warnings = [], errors = [], status, user = null, version = null
} = {}) {
  return createDTO('history', { type, timestamp, durationMs, recordCount, warnings, errors, status, user, version });
}
