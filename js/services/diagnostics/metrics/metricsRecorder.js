// metrics/metricsRecorder.js
// Performance Metrics infrastructure (Milestone 11C section "Performance
// Metrics"): event count, handler duration, and dispatch latency. No
// charts, no dashboards -- a plain, queryable aggregate, "for future
// tooling" exactly like reports/diagnosticReportBuilder.js.
//
// "Handler duration"/"subscriber latency" here means observer/
// eventObserver.js's OWN processing time for each event it observes --
// the Event Bus (11A, frozen, not modified by this milestone) does not
// expose OTHER subscribers' durations to a sibling subscriber, so that is
// the only latency this platform can honestly measure without reaching
// into bus.js internals (see docs/milestone-11c-diagnostics-design.md
// section "What this milestone cannot measure, and why" for the full
// rationale). "Publish latency" is recorded as dispatch latency: the time
// between an event's own `timestamp` (stamped inside publish(), before
// dispatch) and the moment this subscriber received it -- near-zero on a
// synchronous bus, but real, measured, not fabricated.

import { deepFreeze } from '../shared/freezeDeep.js';

function createSampleAggregate () {
  let count = 0;
  let sum = 0;
  let min = null;
  let max = null;
  return {
    record (ms) {
      count += 1;
      sum += ms;
      min = min === null ? ms : Math.min(min, ms);
      max = max === null ? ms : Math.max(max, ms);
    },
    snapshot () {
      return deepFreeze({
        count,
        avgMs: count === 0 ? 0 : sum / count,
        minMs: min === null ? 0 : min,
        maxMs: max === null ? 0 : max
      });
    },
    clear () { count = 0; sum = 0; min = null; max = null; }
  };
}

export function createMetricsRecorder () {
  let totalEventsObserved = 0;
  const eventCountByType = {};
  const handlerDuration = createSampleAggregate();
  const dispatchLatency = createSampleAggregate();

  /**
   * @param {import('../../events/contracts/eventEnvelope.js').DomainEvent} event
   * @param {{handlerDurationMs: number, dispatchLatencyMs: number}} timing
   */
  function recordEvent (event, { handlerDurationMs, dispatchLatencyMs } = {}) {
    totalEventsObserved += 1;
    eventCountByType[event.type] = (eventCountByType[event.type] || 0) + 1;
    if (typeof handlerDurationMs === 'number') handlerDuration.record(handlerDurationMs);
    if (typeof dispatchLatencyMs === 'number') dispatchLatency.record(dispatchLatencyMs);
  }

  function snapshot () {
    return deepFreeze({
      generatedAt: new Date().toISOString(),
      totalEventsObserved,
      eventCountByType: { ...eventCountByType },
      handlerDuration: handlerDuration.snapshot(),
      dispatchLatency: dispatchLatency.snapshot()
    });
  }

  function clear () {
    totalEventsObserved = 0;
    for (const key of Object.keys(eventCountByType)) delete eventCountByType[key];
    handlerDuration.clear();
    dispatchLatency.clear();
  }

  return { recordEvent, snapshot, clear };
}
