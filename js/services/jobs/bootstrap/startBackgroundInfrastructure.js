// bootstrap/startBackgroundInfrastructure.js
// The ONE function real pages call, from their own EXISTING startup flow
// (Milestone 11D's explicit implementation rule: "use the current
// application startup flow... do NOT create a new bootstrap framework...
// do NOT create a parallel initialization system"). Every page in this
// app that calls requireAuth() already has its own `async function boot()`
// -- this function is called from inside that same, pre-existing function,
// immediately after a session is confirmed, as one additional line. No new
// bootstrap file, page, or initialization mechanism was introduced anywhere
// else in the application; see docs/milestone-11d-job-engine-report.md
// "Files modified" for the exact seven call sites.
//
// `jobDispatcher` is constructed here (not in index.js) specifically to
// avoid a circular import: index.js re-exports both `jobDispatcher` and
// `startBackgroundInfrastructure` FROM this file, so this file must not
// import back from index.js.
//
// Idempotent: calling this more than once (it never is, in the real app --
// each page's boot() runs exactly once per page load -- but tests call it
// freely) only registers/starts the dispatcher the first time.

import { createJobDispatcher } from '../dispatcher/jobDispatcher.js';
import { createWriteDiagnosticEntryJob } from '../jobs/writeDiagnosticEntryJob.js';
import { createRefreshMetricsJob } from '../jobs/refreshMetricsJob.js';
import { createUpdateExecutionCountersJob } from '../jobs/updateExecutionCountersJob.js';
// Milestone 12A (Inventory Intelligence Platform) -- registered here per
// this file's own documented extension point ("add it to
// bootstrap/startBackgroundInfrastructure.js if it should run everywhere
// the engine already does", docs/job-engine-architecture.md §11). Lives
// under businessIntelligence/jobs/, not jobs/jobs/, since it belongs to
// that platform, not this one -- jobs/'s own registry/dispatcher/lifecycle
// files are unchanged.
import { createRefreshInventoryInsightsJob } from '../../businessIntelligence/jobs/refreshInventoryInsightsJob.js';
// Milestone 12B (Purchase Intelligence Platform) -- same documented
// extension point, one more job.
import { createRefreshPurchaseInsightsJob } from '../../businessIntelligence/jobs/refreshPurchaseInsightsJob.js';
// Milestone 12C (Sales Intelligence Platform) -- same documented extension
// point, one more job.
import { createRefreshSalesInsightsJob } from '../../businessIntelligence/jobs/refreshSalesInsightsJob.js';
// Milestone 12D (Pricing Intelligence Platform) -- same documented
// extension point, one more job.
import { createRefreshPricingInsightsJob } from '../../businessIntelligence/jobs/refreshPricingInsightsJob.js';

/** The application-wide Job Dispatcher instance. Empty and unstarted until startBackgroundInfrastructure() runs. */
export const jobDispatcher = createJobDispatcher();

let started = false;

/**
 * Registers this milestone's three passive demonstration jobs and starts
 * the dispatcher (subscribing each job to its declared trigger events on
 * the real, shared Event Bus). Safe to call more than once -- only the
 * first call has any effect.
 * @returns {ReturnType<typeof createJobDispatcher>} the shared jobDispatcher
 */
export function startBackgroundInfrastructure () {
  if (started) return jobDispatcher;
  jobDispatcher.registerJob(createWriteDiagnosticEntryJob());
  jobDispatcher.registerJob(createRefreshMetricsJob());
  jobDispatcher.registerJob(createUpdateExecutionCountersJob());
  jobDispatcher.registerJob(createRefreshInventoryInsightsJob());
  jobDispatcher.registerJob(createRefreshPurchaseInsightsJob());
  jobDispatcher.registerJob(createRefreshSalesInsightsJob());
  jobDispatcher.registerJob(createRefreshPricingInsightsJob());
  jobDispatcher.start();
  started = true;
  return jobDispatcher;
}
