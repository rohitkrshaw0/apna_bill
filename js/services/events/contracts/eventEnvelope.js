// contracts/eventEnvelope.js
// The one, permanent envelope shape every domain event conforms to
// (Milestone 11A). See docs/milestone-11a-event-bus-design.md section 8
// ("Interfaces") for the full rationale -- summarized here:
//
//   id           string   unique per event instance (crypto.randomUUID())
//   type         string   PascalCase "<Aggregate><PastTenseFact>" -- see
//                         registry/eventTypes.js for the naming convention
//   timestamp    string   ISO-8601, when the event was created
//   aggregate    string   the domain aggregate this event is about
//                         ("purchase", "sale", ...), from the registry
//   aggregateId  any      identifies WHICH instance of that aggregate
//   version      number   the payload contract version for this event type
//   payload      object   the business facts -- event-type-specific shape
//   metadata     object   optional context (see context/eventContext.js);
//                         never required, always present as an object
//
// Every event this bus ever hands to a subscriber is deep-frozen: no
// subscriber can mutate what another subscriber (or the publisher) sees.

import { deepFreeze } from '../shared/freezeDeep.js';

export const EVENT_ENVELOPE_VERSION = 1;

function generateEventId () {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older browsers/test
  // shells) -- not cryptographically strong, only needs to be unique-enough
  // for correlating log lines and test assertions.
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @typedef {object} DomainEvent
 * @property {string} id
 * @property {string} type
 * @property {string} timestamp
 * @property {string} aggregate
 * @property {*} aggregateId
 * @property {number} version
 * @property {object} payload
 * @property {object} metadata
 */

/**
 * Builds one frozen DomainEvent. Callers normally reach this indirectly via
 * eventBus.publish(), which fills in `aggregate`/`version` from the registry
 * automatically -- this function is exported directly for tests and for any
 * future subscriber (e.g. Audit, 11D) that needs to construct an event of
 * its own (a "AuditEntryRecorded" event, say) without going through publish.
 *
 * @param {string} eventType
 * @param {{aggregate: string, aggregateId: *, payload?: object, version?: number, metadata?: object}} details
 * @returns {DomainEvent}
 */
export function createDomainEvent (eventType, { aggregate, aggregateId, payload = {}, version = 1, metadata = {} } = {}) {
  if (!eventType || typeof eventType !== 'string') throw new TypeError('createDomainEvent: eventType is required');
  if (!aggregate || typeof aggregate !== 'string') throw new TypeError('createDomainEvent: aggregate is required');
  if (aggregateId === undefined || aggregateId === null || aggregateId === '') {
    throw new TypeError('createDomainEvent: aggregateId is required');
  }

  return deepFreeze({
    id: generateEventId(),
    type: eventType,
    timestamp: new Date().toISOString(),
    aggregate,
    aggregateId,
    version,
    payload,
    metadata: { ...metadata }
  });
}

const REQUIRED_FIELDS = ['id', 'type', 'timestamp', 'aggregate', 'aggregateId', 'version', 'payload', 'metadata'];

/**
 * Structural contract check -- throws if `event` is missing any required
 * envelope field. Used by tests and available to any future subscriber that
 * accepts events from outside this bus (e.g. a replayed history entry) and
 * wants to validate the shape before trusting it.
 * @param {DomainEvent} event
 */
export function assertValidDomainEvent (event) {
  if (!event || typeof event !== 'object') throw new TypeError('assertValidDomainEvent: event must be an object');
  for (const key of REQUIRED_FIELDS) {
    if (!(key in event)) throw new TypeError(`assertValidDomainEvent: missing "${key}"`);
  }
  return true;
}
