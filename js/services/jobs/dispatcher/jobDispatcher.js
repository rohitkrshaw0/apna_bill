// dispatcher/jobDispatcher.js
// The Job Dispatcher (Milestone 11D section "Job Dispatcher"). Accepts
// work from Domain Event subscribers -- registerJob() maps a job's
// declared triggerEvents onto real eventBus.subscribe() calls, so every
// dispatched job runs through this one execution pipeline (executeJob()
// below) and NO OTHER path. No job handler is ever called from anywhere
// else in this codebase -- confirmed by grep: `.handler(` appears nowhere
// outside this file.
//
// ARCHITECTURAL PRINCIPLE (permanent, from the brief): the ERP always
// completes first. A job's triggerEvents are Domain Events -- by the time
// any of them exists, createDomainEvent() has already stamped it and the
// business operation it describes has already fully succeeded (11B's own
// publishing rule). This dispatcher only ever reacts to that; it has no
// mechanism to call back into business code, and never will -- there is no
// export anywhere in jobs/ that a business module could import to trigger
// a job directly. Jobs never initiate business operations.
//
// Non-blocking: subscribe() handlers registered here are `async` -- the
// Event Bus (11A) does not await a subscriber's returned promise, so a
// job's own execution (however long it takes) never delays or blocks the
// business code that published the triggering event. This is what makes
// job execution genuinely "non-blocking infrastructure work," not just an
// async-flavored function call.
//
// Error handling (permanent, from the brief): a job failure is caught
// inside executeJob() and NEVER rethrown -- not to the Event Bus (which
// would only log it anyway, same as any other subscriber error, per 11A
// design doc §12), and never anywhere a business code path could see it.
// No automatic retry exists anywhere in this file, by design -- "out of
// scope" per the brief, not an oversight.
//
// Job Context: reused verbatim from diagnostics' own TraceContext
// (deriveTraceContextFromEvent), never reimplemented -- see the brief's
// "Job Context" section ("reuse existing Trace Context and Diagnostics
// Context... do not duplicate context systems"). There is no separate
// `jobContext.js` file anywhere in this platform; Job Context IS Trace
// Context.
//
// Diagnostics integration: this dispatcher constructs its own instances of
// diagnostics' reusable factories (createStructuredLogger/
// createExecutionTimeline/createMetricsRecorder) rather than reimplementing
// any of their logic -- exactly the reuse path
// docs/diagnostics-architecture.md §12 already anticipated ("a future
// Background Jobs milestone... can use createExecutionTimeline()/
// createMetricsRecorder() directly, independent of the Event Bus").

import { eventBus as defaultEventBus } from '../../events/index.js';
import {
  createStructuredLogger, createExecutionTimeline, createMetricsRecorder,
  deriveTraceContextFromEvent, describeError
} from '../../diagnostics/index.js';
import { createJobRegistry } from '../registry/jobRegistry.js';
import { createJobRun, toRunning, toCompleted, toFailed, JOB_STATUS } from '../lifecycle/jobLifecycle.js';

const MAX_RUN_HISTORY = 500;

/**
 * @param {object} [opts]
 * @param {ReturnType<import('../../events/index.js').createEventBus>} [opts.eventBus]
 * @param {ReturnType<import('../registry/jobRegistry.js').createJobRegistry>} [opts.registry]
 * @param {ReturnType<typeof createStructuredLogger>} [opts.logger]
 * @param {ReturnType<typeof createExecutionTimeline>} [opts.timeline]
 * @param {ReturnType<typeof createMetricsRecorder>} [opts.metrics]
 */
export function createJobDispatcher ({
  eventBus = defaultEventBus,
  registry = createJobRegistry(),
  logger = createStructuredLogger({ name: 'jobs.dispatcher' }),
  timeline = createExecutionTimeline(),
  metrics = createMetricsRecorder()
} = {}) {
  /** @type {Map<string, Function[]>} jobId -> its bus unsubscribe function(s), one per triggerEvent */
  const activeSubscriptions = new Map();
  const runHistory = [];
  let running = false;

  function recordRun (run) {
    runHistory.push(run);
    if (runHistory.length > MAX_RUN_HISTORY) runHistory.shift();
  }

  // The single execution pipeline every dispatched job runs through --
  // self-protected (never throws/rejects out of this function), so a
  // job's own bug can never reach the Event Bus's dispatch loop, exactly
  // mirroring diagnostics/observer/eventObserver.js's own self-protection
  // pattern from 11C.
  async function executeJob (definition, event) {
    let run = createJobRun({ jobId: definition.id, triggerEventType: event.type, triggerEventId: event.id });
    const context = deriveTraceContextFromEvent(event);
    const boundLogger = logger.withTrace(context);
    const handle = timeline.start(`job:${definition.id}`, { jobId: definition.id, jobRunId: run.jobRunId, triggerEventType: event.type });

    run = toRunning(run);
    boundLogger.debug(`Job "${definition.id}" started`, { meta: { jobRunId: run.jobRunId, triggerEventType: event.type, triggerEventId: event.id } });

    try {
      const output = await definition.handler({ event, context });
      run = toCompleted(run, output);
      timeline.finish(handle, { success: true });
      metrics.recordEvent({ type: definition.id }, { handlerDurationMs: run.durationMs, dispatchLatencyMs: 0 });
      boundLogger.info(`Job "${definition.id}" completed`, { meta: { jobRunId: run.jobRunId, durationMs: run.durationMs, success: output?.success !== false } });
    } catch (error) {
      run = toFailed(run, error);
      timeline.finish(handle, { success: false, error });
      metrics.recordEvent({ type: definition.id }, { handlerDurationMs: run.durationMs, dispatchLatencyMs: 0 });
      // Never rethrown -- see header comment. Job failures are isolated,
      // logged, and recorded; they never affect ERP execution, never
      // re-run business logic, and are never automatically retried.
      boundLogger.error(`Job "${definition.id}" failed`, { meta: { jobRunId: run.jobRunId, error: describeError(error) } });
    }

    recordRun(run);
    return run;
  }

  /**
   * Adds a job to the registry. Does NOT subscribe to the Event Bus yet --
   * that only happens once start() runs, so every job can be registered
   * up front (at module load) before the dispatcher is actually started
   * (at real application initialization -- see
   * jobs/bootstrap/startBackgroundInfrastructure.js).
   * @param {import('../contracts/jobContract.js').JobDefinition} definition
   */
  function registerJob (definition) {
    const registered = registry.register(definition);
    if (running) subscribeJob(registered);
    return registered;
  }

  function subscribeJob (definition) {
    const unsubs = definition.triggerEvents.map((eventType) =>
      eventBus.subscribe(eventType, (event) => { executeJob(definition, event); })
    );
    activeSubscriptions.set(definition.id, unsubs);
  }

  /** Subscribes every currently-registered job to its declared trigger events. Idempotent. */
  function start () {
    if (running) return false;
    for (const definition of registry.list()) subscribeJob(definition);
    running = true;
    logger.info('Job dispatcher started', { meta: { jobCount: registry.list().length } });
    return true;
  }

  /** Unsubscribes every job. Idempotent. */
  function stop () {
    if (!running) return false;
    for (const unsubs of activeSubscriptions.values()) unsubs.forEach((unsub) => unsub());
    activeSubscriptions.clear();
    running = false;
    logger.info('Job dispatcher stopped');
    return true;
  }

  function isRunning () {
    return running;
  }

  function getRunHistory () {
    return runHistory.slice();
  }

  return {
    registerJob, start, stop, isRunning,
    getRunHistory,
    registry, timeline, metrics, logger,
    JOB_STATUS
  };
}
