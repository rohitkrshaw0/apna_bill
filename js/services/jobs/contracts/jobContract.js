// contracts/jobContract.js
// The one, permanent shape every background job conforms to (Milestone
// 11D). A JobDefinition is metadata + a handler function; a JobInput/
// JobOutput pair is the handler's own clear input/output contract (the
// brief's own wording) -- "jobs must expose clear input and output
// contracts... jobs must not depend on UI code." No job handler file
// anywhere under jobs/jobs/ imports from js/ui/ -- confirmed by grep, not
// just by policy (same convention observer/eventObserver.js's "never
// calls eventBus.publish" guarantee already established in 11C).

import { deepFreeze } from '../shared/freezeDeep.js';

/**
 * @typedef {object} JobInput
 * @property {import('../../events/contracts/eventEnvelope.js').DomainEvent} event the triggering Domain Event, already frozen by the Event Bus
 * @property {object} context the Job Context (Trace Context, reused verbatim -- see dispatcher/jobDispatcher.js's header comment)
 */

/**
 * @typedef {object} JobOutput
 * @property {boolean} success
 * @property {*} [result] small, structured, job-specific result -- never the whole application state
 * @property {string} [message]
 */

/**
 * @typedef {object} JobDefinition
 * @property {string} id one of registry/jobIds.js's JOB_IDS
 * @property {string} name human-readable name
 * @property {number} version
 * @property {string} description
 * @property {string[]} triggerEvents one or more events/registry EVENT_TYPES values
 * @property {(input: JobInput) => JobOutput|Promise<JobOutput>} handler
 */

/**
 * @param {object} fields
 * @returns {JobDefinition}
 */
export function createJobDefinition ({ id, name, version = 1, description, triggerEvents, handler }) {
  assertValidJobDefinitionFields({ id, name, version, description, triggerEvents, handler });
  // handler is deliberately NOT passed through deepFreeze's recursion target
  // separately -- deepFreeze(value) already skips non-object values
  // (functions included), so freezing the definition object leaves the
  // function reference itself exactly as the caller supplied it.
  return deepFreeze({ id, name, version, description, triggerEvents: [...triggerEvents], handler });
}

function assertValidJobDefinitionFields ({ id, name, version, description, triggerEvents, handler }) {
  if (!id || typeof id !== 'string') throw new TypeError('createJobDefinition: id is required');
  if (!name || typeof name !== 'string') throw new TypeError('createJobDefinition: name is required');
  if (!Number.isInteger(version) || version < 1) throw new TypeError('createJobDefinition: version must be a positive integer');
  if (!description || typeof description !== 'string') throw new TypeError('createJobDefinition: description is required');
  if (!Array.isArray(triggerEvents) || triggerEvents.length === 0) throw new TypeError('createJobDefinition: triggerEvents must be a non-empty array');
  if (typeof handler !== 'function') throw new TypeError('createJobDefinition: handler must be a function');
}

/**
 * @param {JobDefinition} definition
 */
export function assertValidJobDefinition (definition) {
  if (!definition || typeof definition !== 'object') throw new TypeError('assertValidJobDefinition: definition must be an object');
  assertValidJobDefinitionFields(definition);
  return true;
}

/**
 * Convenience builder so every job handler produces an identically-shaped
 * JobOutput without hand-rolling the object each time.
 * @param {{success: boolean, result?: *, message?: string}} fields
 * @returns {JobOutput}
 */
export function createJobOutput ({ success, result = null, message = null }) {
  return deepFreeze({ success: !!success, result, message });
}
