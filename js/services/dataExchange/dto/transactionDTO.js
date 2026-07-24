// dto/transactionDTO.js
// A generic single-record envelope moving through the pipeline: which
// entity type it is, its payload, and any pipeline metadata attached along
// the way. NOT the transaction *engine* (atomic commit/rollback) -- that
// lives in transactions/transactionEngine.js. This is just data.

import { createDTO } from './baseDTO.js';

export function createTransactionDTO ({ entityType, payload, meta = {} } = {}) {
  return createDTO('transaction', { entityType, payload, meta });
}
