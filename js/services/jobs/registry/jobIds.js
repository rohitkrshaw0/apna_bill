// registry/jobIds.js
// The single source of truth for every background job id this application
// recognizes (Milestone 11D). No module should ever hardcode a job id
// string literal -- import the constant from here instead, exactly the
// same "avoid string literals" rule events/registry/eventTypes.js already
// established for domain event types.
//
// Naming convention: the JS constant identifier is SCREAMING_SNAKE_CASE
// (matching EVENT_TYPES' own constants); the job id's STRING VALUE is
// camelCase, verb-first, describing WHAT the job does ("writeDiagnosticEntry"),
// deliberately different from event types' PascalCase past-tense-fact
// convention ("PurchaseCreated") -- a job id names an action a piece of
// infrastructure performs, not a business fact that already happened, so
// mixing the two namings would blur a real distinction this platform wants
// to keep.

import { deepFreeze } from '../shared/freezeDeep.js';

export const JOB_IDS = deepFreeze({
  WRITE_DIAGNOSTIC_ENTRY: 'writeDiagnosticEntry',
  REFRESH_METRICS: 'refreshMetrics',
  UPDATE_EXECUTION_COUNTERS: 'updateExecutionCounters',
  // Milestone 12A (Inventory Intelligence Platform) -- see
  // jobs/refreshInventoryInsightsJob.js.
  REFRESH_INVENTORY_INSIGHTS: 'refreshInventoryInsights'
});
