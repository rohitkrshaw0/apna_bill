// reports/diagnosticReportBuilder.js
// Diagnostic Reports infrastructure (Milestone 11C section "Diagnostic
// Reports"): a pure function turning an observer's current metrics +
// timeline state into one structured, frozen snapshot object -- "for
// future tooling" per the brief (a future Diagnostics Dashboard, or 11D
// Audit) to consume. No UI, no side effects, no I/O -- calling this twice
// with the same inputs produces the same shape (though `generatedAt` and
// `uptimeMs`, being real clock reads, will naturally differ call to call).

import { deepFreeze } from '../shared/freezeDeep.js';

/**
 * @param {object} opts
 * @param {ReturnType<import('../metrics/metricsRecorder.js').createMetricsRecorder>} opts.metrics
 * @param {ReturnType<import('../timeline/executionTimeline.js').createExecutionTimeline>} opts.timeline
 * @param {number} [opts.startedAt] a now()-style timestamp this observer/session started at, for uptimeMs
 * @param {number} [opts.recentTimelineLimit] how many of the most recent timeline entries to include
 */
export function createDiagnosticReport ({ metrics, timeline, startedAt = null, recentTimelineLimit = 50 } = {}) {
  const timelineEntries = timeline ? timeline.snapshot() : [];
  return deepFreeze({
    generatedAt: new Date().toISOString(),
    uptimeMs: startedAt === null ? null : Math.max(0, nowSafe() - startedAt),
    metrics: metrics ? metrics.snapshot() : null,
    recentTimeline: timelineEntries.slice(-recentTimelineLimit),
    timelineEntryCount: timelineEntries.length
  });
}

function nowSafe () {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
}
