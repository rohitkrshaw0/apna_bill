// jobs/refreshMetricsJob.js
// Initial demonstration job (Milestone 11D section "Initial Jobs"):
// "refresh internal metrics." Purely passive, in-memory bookkeeping only
// -- maintains a running per-aggregate tally of transactional events this
// job has observed, refreshed on every trigger. No database write, no UI,
// no business functionality. Triggers on the two transactional-document
// events (11B).

import { EVENT_TYPES } from '../../events/index.js';
import { JOB_IDS } from '../registry/jobIds.js';
import { createJobDefinition, createJobOutput } from '../contracts/jobContract.js';

// Module-scoped, in-memory only -- deliberately not persisted anywhere
// (no audit log, per this milestone's own "DO NOT build Audit Platform").
const tallyByAggregate = {};

/** @param {import('../contracts/jobContract.js').JobInput} input */
async function handler ({ event }) {
  tallyByAggregate[event.aggregate] = (tallyByAggregate[event.aggregate] || 0) + 1;
  return createJobOutput({ success: true, result: { refreshed: true, tally: { ...tallyByAggregate } } });
}

export function createRefreshMetricsJob () {
  return createJobDefinition({
    id: JOB_IDS.REFRESH_METRICS,
    name: 'Refresh Internal Metrics',
    version: 1,
    description: 'Maintains an in-memory per-aggregate tally of transactional events, refreshed on every trigger. Demonstrates job-owned state across invocations; performs no business work.',
    triggerEvents: [EVENT_TYPES.PURCHASE_CREATED, EVENT_TYPES.SALE_CREATED],
    handler
  });
}
