// lifecycle/jobLifecycle.js
// Job Lifecycle (Milestone 11D section "Job Lifecycle"). Exactly the five
// states the brief names -- Pending, Running, Completed, Failed, Cancelled
// -- and no others. Every transition returns a NEW frozen JobRun snapshot
// rather than mutating one in place, matching this codebase's pervasive
// immutability convention (DomainEvent, HistoryEntry, etc. all work the
// same way).
//
// `toCancelled()` is defined but never called anywhere in this milestone
// -- Cancelled is explicitly "reserved for future use" per the brief; the
// transition function exists so a future caller has it ready without
// needing to modify this file.

import { deepFreeze } from '../shared/freezeDeep.js';
import { generateId } from '../shared/generateId.js';
import { now } from '../shared/now.js';
import { describeError } from '../../diagnostics/errors/errorClassifier.js';

export const JOB_STATUS = deepFreeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

/**
 * @typedef {object} JobRun
 * @property {string} jobRunId
 * @property {string} jobId
 * @property {string} status one of JOB_STATUS
 * @property {string} triggerEventType
 * @property {string} triggerEventId
 * @property {number|null} startedAt
 * @property {number|null} finishedAt
 * @property {number|null} durationMs
 * @property {import('../contracts/jobContract.js').JobOutput|null} output
 * @property {object|null} error a describeError() summary, or null
 */

/**
 * @param {{jobId: string, triggerEventType: string, triggerEventId: string}} fields
 * @returns {JobRun} a new run in PENDING -- not yet started
 */
export function createJobRun ({ jobId, triggerEventType, triggerEventId }) {
  return deepFreeze({
    jobRunId: generateId('run'),
    jobId,
    status: JOB_STATUS.PENDING,
    triggerEventType,
    triggerEventId,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    output: null,
    error: null
  });
}

/** @param {JobRun} run @returns {JobRun} */
export function toRunning (run) {
  return deepFreeze({ ...run, status: JOB_STATUS.RUNNING, startedAt: now() });
}

/**
 * @param {JobRun} run
 * @param {import('../contracts/jobContract.js').JobOutput} output
 * @returns {JobRun}
 */
export function toCompleted (run, output) {
  const finishedAt = now();
  return deepFreeze({
    ...run,
    status: JOB_STATUS.COMPLETED,
    finishedAt,
    durationMs: finishedAt - (run.startedAt ?? finishedAt),
    output
  });
}

/**
 * @param {JobRun} run
 * @param {*} error
 * @returns {JobRun}
 */
export function toFailed (run, error) {
  const finishedAt = now();
  return deepFreeze({
    ...run,
    status: JOB_STATUS.FAILED,
    finishedAt,
    durationMs: finishedAt - (run.startedAt ?? finishedAt),
    error: describeError(error)
  });
}

/**
 * Reserved for future use (see header comment) -- not called by this
 * milestone's dispatcher, which never cancels a job once dispatched.
 * @param {JobRun} run
 * @returns {JobRun}
 */
export function toCancelled (run) {
  const finishedAt = now();
  return deepFreeze({
    ...run,
    status: JOB_STATUS.CANCELLED,
    finishedAt,
    durationMs: finishedAt - (run.startedAt ?? finishedAt)
  });
}
