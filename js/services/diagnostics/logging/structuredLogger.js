// logging/structuredLogger.js
// The one structured logger this platform provides (Milestone 11C section
// "Logging rules": structured, consistent, centralized, configurable,
// environment-aware). Every entry is an object, never a free-form string --
// callers passing only a message still get a fully structured LogEntry out
// the other side, with an empty trace/meta rather than an omitted one, so
// every entry has an identical, predictable shape for a future log
// consumer to depend on.
//
// "Environment-aware" here means `minLevel`: a caller (or an environment-
// specific bootstrap, not built by this milestone) sets it low (DEBUG) in
// development and high (WARN) in production -- the logger itself has no
// concept of "environment", only a configurable filter threshold, since
// this is a browser codebase with no process.env to read.

import { LOG_LEVELS, LOG_LEVEL_PRIORITY } from './logLevels.js';
import { createConsoleSink } from './consoleSink.js';

/**
 * @typedef {object} LogEntry
 * @property {string} level one of LOG_LEVELS
 * @property {string} name the logger's name (which subsystem logged this)
 * @property {string} message
 * @property {string} timestamp ISO-8601
 * @property {object} trace whatever TraceContext fields were supplied, or {}
 * @property {object} meta caller-supplied structured detail, or {}
 */

/**
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {{write: (entry: LogEntry) => void}} [opts.sink]
 * @param {string} [opts.minLevel] one of LOG_LEVELS -- entries below this are dropped before reaching the sink
 */
export function createStructuredLogger ({ name = 'diagnostics', sink = createConsoleSink(), minLevel = LOG_LEVELS.INFO } = {}) {
  const minPriority = LOG_LEVEL_PRIORITY[minLevel] ?? LOG_LEVEL_PRIORITY[LOG_LEVELS.INFO];

  function write (level, message, { trace = {}, meta = {} } = {}) {
    if (LOG_LEVEL_PRIORITY[level] < minPriority) return;
    sink.write({ level, name, message, timestamp: new Date().toISOString(), trace, meta });
  }

  const logger = {
    debug: (message, opts) => write(LOG_LEVELS.DEBUG, message, opts),
    info: (message, opts) => write(LOG_LEVELS.INFO, message, opts),
    warn: (message, opts) => write(LOG_LEVELS.WARN, message, opts),
    error: (message, opts) => write(LOG_LEVELS.ERROR, message, opts),
    // Binds a TraceContext once, returning a logger whose four methods no
    // longer need `{ trace }` passed at every call site -- useful for a
    // block of logging that all belongs to the same observed operation.
    withTrace (trace) {
      return {
        debug: (message, opts = {}) => write(LOG_LEVELS.DEBUG, message, { ...opts, trace }),
        info: (message, opts = {}) => write(LOG_LEVELS.INFO, message, { ...opts, trace }),
        warn: (message, opts = {}) => write(LOG_LEVELS.WARN, message, { ...opts, trace }),
        error: (message, opts = {}) => write(LOG_LEVELS.ERROR, message, { ...opts, trace })
      };
    }
  };
  return logger;
}
