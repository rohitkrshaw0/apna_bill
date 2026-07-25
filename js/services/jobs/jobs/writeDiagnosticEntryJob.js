// jobs/writeDiagnosticEntryJob.js
// Initial demonstration job (Milestone 11D section "Initial Jobs"): "write
// structured diagnostic entry." Purely passive -- reads the triggering
// event's own fields and writes one structured log line via the
// Diagnostics Platform's own logger; no database write, no UI, no
// business functionality of any kind. Triggers on the three master-data
// creation events (11B) as a representative, low-volume sample -- enough
// to validate the engine's event-to-job mapping without needing every
// registered event type wired to a demonstration job.

import { EVENT_TYPES } from '../../events/index.js';
import { createStructuredLogger } from '../../diagnostics/index.js';
import { JOB_IDS } from '../registry/jobIds.js';
import { createJobDefinition, createJobOutput } from '../contracts/jobContract.js';

const logger = createStructuredLogger({ name: 'jobs.writeDiagnosticEntry' });

/** @param {import('../contracts/jobContract.js').JobInput} input */
async function handler ({ event, context }) {
  logger.withTrace(context).info(`Diagnostic entry for ${event.type}`, {
    meta: { aggregate: event.aggregate, aggregateId: event.aggregateId, eventId: event.id }
  });
  return createJobOutput({ success: true, result: { logged: true, aggregate: event.aggregate } });
}

export function createWriteDiagnosticEntryJob () {
  return createJobDefinition({
    id: JOB_IDS.WRITE_DIAGNOSTIC_ENTRY,
    name: 'Write Diagnostic Entry',
    version: 1,
    description: 'Writes one structured diagnostic log entry describing a master-data creation event. Demonstrates event-to-job dispatch and Diagnostics Platform reuse; performs no business work.',
    triggerEvents: [EVENT_TYPES.ITEM_CREATED, EVENT_TYPES.CUSTOMER_CREATED, EVENT_TYPES.SUPPLIER_CREATED],
    handler
  });
}
