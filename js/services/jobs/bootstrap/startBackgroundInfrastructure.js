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
  jobDispatcher.start();
  started = true;
  return jobDispatcher;
}
