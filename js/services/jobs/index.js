// services/jobs/index.js
// Public barrel for the Background Job Engine (Milestone 11D). Depends
// only on events/ and diagnostics/ (their public barrels) -- nothing under
// dataExchange/ or any business file is imported anywhere in this
// platform, and no business file imports FROM this platform except the
// one, deliberate bootstrap call each real page's own startup flow makes
// (see bootstrap/startBackgroundInfrastructure.js).
//
// `jobDispatcher` (re-exported from bootstrap/startBackgroundInfrastructure.js,
// which owns constructing it -- see that file's own header comment for why,
// to avoid a circular import back into this barrel) is the one shared,
// application-wide dispatcher instance real code uses. Constructing it has
// NO side effects -- it holds an empty registry and is not started; nothing
// runs until startBackgroundInfrastructure() is called (each real page's
// own boot() does that -- see docs/milestone-11d-job-engine-report.md
// "Files modified" for the exact seven call sites).

export { JOB_IDS } from './registry/jobIds.js';
export { createJobRegistry } from './registry/jobRegistry.js';
export { createJobDefinition, assertValidJobDefinition, createJobOutput } from './contracts/jobContract.js';
export { JOB_STATUS, createJobRun, toRunning, toCompleted, toFailed, toCancelled } from './lifecycle/jobLifecycle.js';
export { createJobDispatcher } from './dispatcher/jobDispatcher.js';
export { startBackgroundInfrastructure, jobDispatcher } from './bootstrap/startBackgroundInfrastructure.js';
