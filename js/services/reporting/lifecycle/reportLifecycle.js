// lifecycle/reportLifecycle.js
// Report Lifecycle (Milestone 14A "Report Lifecycle"). Four states --
// Idle, Loading, Loaded, Error -- covering exactly what a report's own
// data-fetch/render cycle needs, the same "explicit states, immutable
// transitions" idiom jobs/lifecycle/jobLifecycle.js already established
// (JOB_STATUS's five states -> a JobRun snapshot). Every transition
// returns a NEW frozen ReportRun rather than mutating one in place.
//
// This is a generic state machine a future report screen's own loader
// drives (IDLE -> LOADING -> LOADED, or -> ERROR on failure, with RESET
// back to IDLE when filters change) -- it has no opinion about WHAT is
// being loaded; that is entirely the future report's own concern.

import { deepFreeze } from '../shared/freezeDeep.js';
import { generateId } from '../shared/generateId.js';
import { now } from '../shared/now.js';
import { describeError } from '../../diagnostics/errors/errorClassifier.js';

export const REPORT_STATUS = deepFreeze({
  IDLE: 'idle',
  LOADING: 'loading',
  LOADED: 'loaded',
  ERROR: 'error'
});

/**
 * @typedef {object} ReportRun
 * @property {string} reportRunId
 * @property {string} reportId
 * @property {string} status one of REPORT_STATUS
 * @property {number|null} startedAt
 * @property {number|null} finishedAt
 * @property {number|null} durationMs
 * @property {*} data null until LOADED
 * @property {object|null} error a describeError() summary, or null
 */

/**
 * @param {{reportId: string}} fields
 * @returns {ReportRun} a new run in IDLE -- nothing requested yet
 */
export function createReportRun ({ reportId }) {
  return deepFreeze({
    reportRunId: generateId('reportRun'),
    reportId,
    status: REPORT_STATUS.IDLE,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    data: null,
    error: null
  });
}

/** @param {ReportRun} run @returns {ReportRun} */
export function toLoading (run) {
  return deepFreeze({ ...run, status: REPORT_STATUS.LOADING, startedAt: now(), finishedAt: null, durationMs: null, data: null, error: null });
}

/**
 * @param {ReportRun} run
 * @param {*} data
 * @returns {ReportRun}
 */
export function toLoaded (run, data) {
  const finishedAt = now();
  return deepFreeze({
    ...run,
    status: REPORT_STATUS.LOADED,
    finishedAt,
    durationMs: finishedAt - (run.startedAt ?? finishedAt),
    data,
    error: null
  });
}

/**
 * @param {ReportRun} run
 * @param {*} error
 * @returns {ReportRun}
 */
export function toError (run, error) {
  const finishedAt = now();
  return deepFreeze({
    ...run,
    status: REPORT_STATUS.ERROR,
    finishedAt,
    durationMs: finishedAt - (run.startedAt ?? finishedAt),
    data: null,
    error: describeError(error)
  });
}

/**
 * Back to a fresh IDLE run for the same report -- e.g. when a filter
 * changes and the previous run's data/error no longer applies.
 * @param {ReportRun} run
 * @returns {ReportRun}
 */
export function toIdle (run) {
  return createReportRun({ reportId: run.reportId });
}
