// observer/eventObserver.js
// The Event Observation layer (Milestone 11C section "Event Observation"
// and "Event Bus Integration"). Subscribes to the existing Event Bus's
// ALL_EVENTS wildcard -- exactly the mechanism
// docs/event-bus-architecture.md section 9 anticipated for Diagnostics
// back in Milestone 11A/11B. Strictly passive:
//
//   - never calls eventBus.publish() -- this file contains no reference to
//     that method anywhere, not just a promise not to call it;
//   - never mutates an observed event -- impossible anyway, since
//     createDomainEvent() deep-freezes every event before dispatch (11A);
//   - never retries, corrects, or influences the business operation the
//     event describes -- by the time this observer sees an event, the
//     operation it describes has already fully completed (11B's own
//     publishing rule: events are emitted strictly after success).
//
// Self-protection: this observer's OWN processing is wrapped in a
// try/catch that never escapes onEvent() -- so even a bug in this code can
// never reach the Event Bus's dispatch loop or affect another subscriber.
// This is redundant with the bus's own per-subscriber isolation (11A
// design doc section 12) by design: a "production safe" diagnostics layer
// should not rely solely on its host's safety net.
//
// Idempotent start()/stop(): calling either twice is a safe no-op, and
// importing this module never subscribes anything by itself -- nothing
// happens until a caller explicitly calls start() (see
// docs/milestone-11c-diagnostics-design.md section "Deliberately not
// started anywhere" for why no bootstrap wiring is added by this
// milestone).

import { eventBus as defaultEventBus, ALL_EVENTS } from '../../events/index.js';
import { createStructuredLogger } from '../logging/index.js';
import { deriveTraceContextFromEvent } from '../trace/traceContext.js';
import { describeError } from '../errors/errorClassifier.js';
import { createExecutionTimeline } from '../timeline/executionTimeline.js';
import { createMetricsRecorder } from '../metrics/metricsRecorder.js';

/**
 * @param {object} [opts]
 * @param {ReturnType<import('../../events/index.js').createEventBus>} [opts.eventBus]
 * @param {ReturnType<import('../logging/structuredLogger.js').createStructuredLogger>} [opts.logger]
 * @param {ReturnType<import('../timeline/executionTimeline.js').createExecutionTimeline>} [opts.timeline]
 * @param {ReturnType<import('../metrics/metricsRecorder.js').createMetricsRecorder>} [opts.metrics]
 */
export function createEventObserver ({
  eventBus = defaultEventBus,
  logger = createStructuredLogger({ name: 'diagnostics.observer' }),
  timeline = createExecutionTimeline(),
  metrics = createMetricsRecorder()
} = {}) {
  let unsubscribe = null;

  // One stopwatch (timeline.start/finish) feeds BOTH this event's own
  // TimelineEntry and the metrics.recordEvent() handlerDuration sample --
  // a single measurement, not two independent ones, so the two subsystems
  // never disagree about how long observing this event actually took.
  function onEvent (event) {
    const handle = timeline.start(`observe:${event.type}`, { eventType: event.type, eventId: event.id });
    try {
      const trace = deriveTraceContextFromEvent(event);
      const dispatchLatencyMs = Math.max(0, Date.now() - Date.parse(event.timestamp));
      logger.withTrace(trace).debug(`Observed ${event.type}`, {
        meta: { eventId: event.id, aggregate: event.aggregate, aggregateId: event.aggregateId, version: event.version }
      });
      const entry = timeline.finish(handle, { success: true });
      metrics.recordEvent(event, { handlerDurationMs: entry.durationMs, dispatchLatencyMs });
    } catch (internalError) {
      // Self-protection (see header comment) -- never rethrown, never
      // allowed to reach the Event Bus's own dispatch loop.
      timeline.finish(handle, { success: false, error: internalError });
      logger.error('Diagnostics observer failed while processing an event', {
        meta: { eventType: event?.type, error: describeError(internalError) }
      });
    }
  }

  function start () {
    if (unsubscribe) return false;
    unsubscribe = eventBus.subscribe(ALL_EVENTS, onEvent);
    logger.info('Diagnostics observer started');
    return true;
  }

  function stop () {
    if (!unsubscribe) return false;
    unsubscribe();
    unsubscribe = null;
    logger.info('Diagnostics observer stopped');
    return true;
  }

  function isRunning () {
    return unsubscribe !== null;
  }

  return { start, stop, isRunning, timeline, metrics, logger };
}
