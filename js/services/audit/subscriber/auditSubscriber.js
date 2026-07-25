// subscriber/auditSubscriber.js
// The Audit Subscriber (Milestone 11E section "Audit Subscriber" and
// "Architectural Principles"). Subscribes DIRECTLY to the Event Bus's
// ALL_EVENTS wildcard -- the exact mechanism
// docs/event-bus-architecture.md and docs/diagnostics-architecture.md
// already anticipated for Audit. This is a first-class Event Bus
// subscriber, a peer of Diagnostics and the Job Engine, NOT a consumer of
// either:
//
//   ERP -> Business Logic -> Domain Event -> Audit Subscriber -> Immutable Audit Record
//
// Audit does NOT execute through the Job Engine -- this file contains no
// import from js/services/jobs/ anywhere, confirmed by grep, not just by
// policy (same verification style every platform in this codebase uses
// for its own "never calls X" guarantees). Audit never publishes a new
// business event either -- no reference to `eventBus.publish` appears
// anywhere in this file.
//
// Self-protection: onEvent() is wrapped in its own try/catch, the same
// pattern diagnostics/observer/eventObserver.js and
// jobs/dispatcher/jobDispatcher.js already established. An audit failure
// (a broken store, a malformed event, anything) is caught, classified,
// logged, and NEVER rethrown -- per the brief's own "Error Handling"
// section: "Audit failures must never: block ERP, rollback ERP, modify
// ERP, retry ERP. Business success must remain successful even if Audit
// fails." There is no retry anywhere in this file, by design.
//
// Diagnostics integration: fresh instances of diagnostics/'s own
// createStructuredLogger()/createExecutionTimeline()/createMetricsRecorder()
// -- the same reuse pattern the Job Engine (11D) already established: new
// instances, zero duplicated logic. Trace integration: Job Context's own
// deriveTraceContextFromEvent() (diagnostics/trace/traceContext.js),
// reused verbatim -- there is no second context system anywhere in this
// platform.

import { eventBus as defaultEventBus, ALL_EVENTS } from '../../events/index.js';
import {
  createStructuredLogger, createExecutionTimeline, createMetricsRecorder,
  deriveTraceContextFromEvent, describeError
} from '../../diagnostics/index.js';
import { isAuditedEventType, getAuditRecordVersion } from '../registry/auditRegistry.js';
import { createAuditRecord } from '../contracts/auditRecord.js';
import { createInMemoryAuditStore } from '../store/auditStore.js';

/**
 * @param {object} [opts]
 * @param {ReturnType<import('../../events/index.js').createEventBus>} [opts.eventBus]
 * @param {ReturnType<typeof createInMemoryAuditStore>} [opts.store] any object satisfying assertValidAuditStore()
 * @param {ReturnType<typeof createStructuredLogger>} [opts.logger]
 * @param {ReturnType<typeof createExecutionTimeline>} [opts.timeline]
 * @param {ReturnType<typeof createMetricsRecorder>} [opts.metrics]
 */
export function createAuditSubscriber ({
  eventBus = defaultEventBus,
  store = createInMemoryAuditStore(),
  logger = createStructuredLogger({ name: 'audit.subscriber' }),
  timeline = createExecutionTimeline(),
  metrics = createMetricsRecorder()
} = {}) {
  let unsubscribe = null;

  function onEvent (event) {
    const handle = timeline.start(`audit:${event.type}`, { eventId: event.id, eventType: event.type });
    try {
      if (!isAuditedEventType(event.type)) {
        // Not a crash-worthy condition -- see registry/auditRegistry.js's
        // own header comment on why an unregistered event type is skipped,
        // not audited by default.
        timeline.finish(handle, { success: true });
        logger.warn(`Observed an unregistered event type -- no audit record created`, {
          meta: { eventType: event.type, eventId: event.id }
        });
        return;
      }

      const traceContext = deriveTraceContextFromEvent(event);
      const record = createAuditRecord({
        event,
        traceContext,
        auditRecordVersion: getAuditRecordVersion(event.type)
      });
      store.append(record);

      const entry = timeline.finish(handle, { success: true });
      metrics.recordEvent({ type: event.type }, { handlerDurationMs: entry.durationMs, dispatchLatencyMs: 0 });
      logger.withTrace(traceContext).info(`Audit record created for ${event.type}`, {
        meta: { auditId: record.auditId, eventId: event.id, aggregate: event.aggregate, aggregateId: event.aggregateId }
      });
    } catch (error) {
      timeline.finish(handle, { success: false, error });
      // Never rethrown -- see header comment. An audit failure is
      // isolated, logged, and recorded as a diagnostics failure; it never
      // affects the Event Bus's dispatch loop, a sibling subscriber, or
      // the ERP code that published the event.
      logger.error('Audit subscriber failed while processing an event', {
        meta: { eventType: event?.type, eventId: event?.id, error: describeError(error) }
      });
    }
  }

  /** Subscribes to ALL_EVENTS. Idempotent. */
  function start () {
    if (unsubscribe) return false;
    unsubscribe = eventBus.subscribe(ALL_EVENTS, onEvent);
    logger.info('Audit subscriber started');
    return true;
  }

  /** Unsubscribes. Idempotent. */
  function stop () {
    if (!unsubscribe) return false;
    unsubscribe();
    unsubscribe = null;
    logger.info('Audit subscriber stopped');
    return true;
  }

  function isRunning () {
    return unsubscribe !== null;
  }

  return {
    start, stop, isRunning, store, timeline, metrics, logger,
    // Exposed for tests -- lets a test drive a single event through the
    // exact same processing path start() wires to the Event Bus, without
    // needing a registered event type to exercise the "unregistered type"
    // branch (registry/auditRegistry.js's own header comment explains why
    // that branch exists). Never called by any other file in this
    // platform outside this factory itself.
    handleEvent: onEvent
  };
}
