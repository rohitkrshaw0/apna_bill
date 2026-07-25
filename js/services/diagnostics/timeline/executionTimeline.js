// timeline/executionTimeline.js
// Execution Timeline infrastructure (Milestone 11C section "Execution
// Timeline"): start/finish/duration/success/failure for any observed
// operation -- not specific to the Event Bus (observer/eventObserver.js
// uses this to time its own per-event processing, but any future caller
// can use it to time anything). A capped ring buffer, not unbounded
// storage -- "lightweight" and "production safe" per the brief's design
// goals; the oldest entry is dropped once maxEntries is reached.
//
// This module NEVER retries, corrects, or swallows an operation's own
// outcome -- time()'s wrapped function's return value and thrown errors
// both pass through completely unchanged (see time() below). Recording
// what happened is this module's only responsibility.

import { now } from '../shared/now.js';
import { describeError } from '../errors/errorClassifier.js';

/**
 * @typedef {object} TimelineEntry
 * @property {string} label
 * @property {number} startedAt (performance.now()-relative)
 * @property {number} finishedAt
 * @property {number} durationMs
 * @property {boolean} success
 * @property {object|null} error a describeError() summary, or null
 * @property {object} meta whatever the caller attached to start()
 */

/**
 * @param {object} [opts]
 * @param {number} [opts.maxEntries]
 */
export function createExecutionTimeline ({ maxEntries = 500 } = {}) {
  const entries = [];

  function start (label, meta = {}) {
    return { label, startedAt: now(), meta };
  }

  /**
   * @param {{label: string, startedAt: number, meta: object}} handle the object start() returned
   * @param {{success?: boolean, error?: *}} [outcome]
   * @returns {TimelineEntry}
   */
  function finish (handle, { success = true, error = null } = {}) {
    const finishedAt = now();
    const entry = {
      label: handle.label,
      startedAt: handle.startedAt,
      finishedAt,
      durationMs: finishedAt - handle.startedAt,
      success: !!success && !error,
      error: error ? describeError(error) : null,
      meta: handle.meta
    };
    entries.push(entry);
    if (entries.length > maxEntries) entries.shift();
    return entry;
  }

  /**
   * Times a sync-or-async function, recording exactly one timeline entry,
   * then returns/rethrows fn's own outcome completely unchanged -- callers
   * see identical behavior to calling fn() directly.
   * @param {string} label
   * @param {() => *} fn
   * @param {object} [meta]
   */
  function time (label, fn, meta = {}) {
    const handle = start(label, meta);
    let result;
    try {
      result = fn();
    } catch (error) {
      finish(handle, { success: false, error });
      throw error;
    }
    if (result && typeof result.then === 'function') {
      return result.then(
        (value) => { finish(handle, { success: true }); return value; },
        (error) => { finish(handle, { success: false, error }); throw error; }
      );
    }
    finish(handle, { success: true });
    return result;
  }

  function snapshot () {
    return entries.slice();
  }

  function clear () {
    entries.length = 0;
  }

  return { start, finish, time, snapshot, clear };
}
