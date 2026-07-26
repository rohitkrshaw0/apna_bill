// diagnostics/biDiagnostics.js
// Reuses the existing Diagnostics & Observability Platform (11C) exactly
// the way the Job Engine (11D) and Audit Platform (11E) already do: fresh
// instances of its logger/timeline/metrics factories, never the shared
// `diagnosticsObserver` (that stays an ALL_EVENTS subscriber; this module
// is not one -- Business Intelligence never subscribes to the Event Bus,
// it is called directly by whatever wants an insight). No new diagnostics
// framework is built here (per the milestone brief: "Do NOT build another
// diagnostics framework").
//
// Every BI calculation emits exactly what the brief asks for: Execution
// Time (timeline), Items Analyzed + Warnings (timeline entry meta),
// Cache Hit / Cache Miss (bumped counters + a debug log line each).

import { createStructuredLogger, createExecutionTimeline, createMetricsRecorder } from '../../diagnostics/index.js';

/**
 * @param {object} [opts]
 * @param {{write: (entry: object) => void}} [opts.sink] passed straight through to createStructuredLogger
 * @param {string} [opts.minLevel]
 */
export function createBiDiagnostics ({ sink, minLevel } = {}) {
  const logger = createStructuredLogger({ name: 'businessIntelligence', ...(sink ? { sink } : {}), ...(minLevel ? { minLevel } : {}) });
  const timeline = createExecutionTimeline();
  const metrics = createMetricsRecorder();

  let cacheHits = 0;
  let cacheMisses = 0;

  /**
   * Times a BI calculation exactly like diagnostics/timeline/executionTimeline.js's
   * own time() -- the wrapped function's return value (sync OR a resolved
   * promise's value) or thrown/rejected error passes through completely
   * unchanged; only one TimelineEntry (labeled `bi:<operation>`) and one
   * metrics sample are recorded as a side effect. Supports an async fn
   * because inventory/inventoryDataLoader.js's own scan is async.
   * @param {string} operation e.g. "getInventorySummary"
   * @param {() => *} fn
   * @param {{itemsAnalyzed?: number, warnings?: string[]}} [meta]
   */
  function time (operation, fn, meta = {}) {
    const label = `bi:${operation}`;
    const handle = timeline.start(label, meta);

    function onSuccess (value) {
      const entry = timeline.finish(handle, { success: true });
      metrics.recordEvent({ type: label }, { handlerDurationMs: entry.durationMs });
      if (meta.warnings && meta.warnings.length) {
        logger.warn(`${operation} completed with ${meta.warnings.length} warning(s)`, { meta: { warnings: meta.warnings } });
      } else {
        logger.debug(`${operation} completed`, { meta });
      }
      return value;
    }

    function onFailure (error) {
      const entry = timeline.finish(handle, { success: false, error });
      // Reusing metricsRecorder.recordEvent() with a synthetic {type} is
      // the same deliberate, minimal reuse pattern the Job Engine's own
      // dispatcher established (see docs/job-engine-architecture.md §8) --
      // recordEvent() only ever reads `.type`, so passing an operation name
      // instead of a DomainEvent is not a new concept.
      metrics.recordEvent({ type: label }, { handlerDurationMs: entry.durationMs });
      throw error;
    }

    let result;
    try {
      result = fn();
    } catch (error) {
      return onFailure(error);
    }
    if (result && typeof result.then === 'function') {
      return result.then(onSuccess, onFailure);
    }
    return onSuccess(result);
  }

  function recordCacheHit (cacheKey) {
    cacheHits += 1;
    logger.debug(`Cache hit for ${cacheKey}`, { meta: { cacheKey } });
  }

  function recordCacheMiss (cacheKey) {
    cacheMisses += 1;
    logger.debug(`Cache miss for ${cacheKey}`, { meta: { cacheKey } });
  }

  function stats () {
    return { cacheHits, cacheMisses, timeline: timeline.snapshot(), metrics: metrics.snapshot() };
  }

  return { logger, timeline, metrics, time, recordCacheHit, recordCacheMiss, stats };
}

/** The application-wide BI diagnostics instance -- fresh, independent instances, never the shared diagnosticsObserver. */
export const biDiagnostics = createBiDiagnostics();
