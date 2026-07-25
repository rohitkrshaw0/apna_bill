// jobs/updateExecutionCountersJob.js
// Initial demonstration job (Milestone 11D section "Initial Jobs"):
// "update internal execution counters." Purely passive -- increments a
// simple in-memory total-execution counter. No database write, no UI, no
// business functionality. Triggers on stock/manufacturing completion
// events (11B), the two remaining representative event types not already
// covered by the other two demonstration jobs.

import { EVENT_TYPES } from '../../events/index.js';
import { JOB_IDS } from '../registry/jobIds.js';
import { createJobDefinition, createJobOutput } from '../contracts/jobContract.js';

// Module-scoped, in-memory only -- see refreshMetricsJob.js's own note on
// why nothing here is persisted.
let totalExecutions = 0;

/** @param {import('../contracts/jobContract.js').JobInput} input */
async function handler () {
  totalExecutions += 1;
  return createJobOutput({ success: true, result: { totalExecutions } });
}

export function createUpdateExecutionCountersJob () {
  return createJobDefinition({
    id: JOB_IDS.UPDATE_EXECUTION_COUNTERS,
    name: 'Update Execution Counters',
    version: 1,
    description: 'Increments an in-memory total-execution counter on stock/manufacturing completion events. Demonstrates simple job-owned counters; performs no business work.',
    triggerEvents: [EVENT_TYPES.STOCK_ADJUSTED, EVENT_TYPES.MANUFACTURING_COMPLETED],
    handler
  });
}
