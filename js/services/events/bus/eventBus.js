// bus/eventBus.js
// The internal, synchronous Domain Event Bus (Milestone 11A). See
// docs/milestone-11a-event-bus-design.md for the full rationale; this file
// implements exactly what that document specifies and nothing more -- it is
// not a message queue, not orchestration, and never triggers business logic
// on its own (see design doc "Important architectural decisions").
//
// Error handling strategy (design doc section "Subscriber isolation"):
// every handler runs inside its own try/catch. A handler that throws, or
// whose returned promise rejects, is logged via the injected logger and
// skipped -- it never stops the remaining subscribers from running and
// never bubbles out of publish(). publish() itself stays fully synchronous;
// a handler's own async work is fire-and-forget from the bus's point of
// view (its rejection is still caught and logged, just not awaited) -- this
// is what keeps publishing an event from ever blocking or reordering the
// business workflow that emitted it.
//
// Execution order: subscribers for the specific event type run first, in
// subscribe() order, followed by wildcard (ALL_EVENTS) subscribers, also in
// subscribe() order. This is deterministic and permanent -- future
// subscribers (Audit, Diagnostics) that need to observe every event use
// ALL_EVENTS rather than subscribing to each event type individually.

import { isKnownEventType, getEventContract } from '../registry/eventTypes.js';
import { createDomainEvent } from '../contracts/eventEnvelope.js';
import { createEventContext } from '../context/eventContext.js';
import { createLogger } from '../shared/logging/index.js';

/** Sentinel passed to subscribe()/unsubscribe() to observe every published event, regardless of type. */
export const ALL_EVENTS = Symbol('events:all');

function assertHandlerIsFunction (handler) {
  if (typeof handler !== 'function') throw new TypeError('eventBus: handler must be a function');
}

function assertKnownType (eventType) {
  if (!isKnownEventType(eventType)) {
    throw new TypeError(`eventBus: "${String(eventType)}" is not a registered event type -- add it to events/registry/eventTypes.js first`);
  }
}

/**
 * @param {{logger?: {info: Function, warn: Function, error: Function, debug: Function}}} [opts]
 */
export function createEventBus ({ logger = createLogger({ name: 'events' }) } = {}) {
  /** @type {Map<string, Function[]>} */
  const subscribers = new Map();
  /** @type {Function[]} */
  const wildcardSubscribers = [];

  function listFor (eventType) {
    return eventType === ALL_EVENTS ? wildcardSubscribers : (subscribers.get(eventType) || null);
  }

  /**
   * @param {string|typeof ALL_EVENTS} eventType
   * @param {(event: import('../contracts/eventEnvelope.js').DomainEvent) => void} handler
   * @returns {() => boolean} an unsubscribe function, for callers that prefer that over calling bus.unsubscribe() themselves.
   */
  function subscribe (eventType, handler) {
    assertHandlerIsFunction(handler);
    if (eventType === ALL_EVENTS) {
      wildcardSubscribers.push(handler);
    } else {
      assertKnownType(eventType);
      if (!subscribers.has(eventType)) subscribers.set(eventType, []);
      subscribers.get(eventType).push(handler);
    }
    return () => unsubscribe(eventType, handler);
  }

  /**
   * @param {string|typeof ALL_EVENTS} eventType
   * @param {Function} handler
   * @returns {boolean} whether a matching subscription was found and removed.
   */
  function unsubscribe (eventType, handler) {
    const list = listFor(eventType);
    if (!list) return false;
    const i = list.indexOf(handler);
    if (i === -1) return false;
    list.splice(i, 1);
    return true;
  }

  function reportSubscriberError (error, event, handler) {
    logger.error(`Subscriber failed handling ${event.type}`, {
      eventId: event.id,
      handler: handler.name || '(anonymous)',
      error: error && error.message ? error.message : String(error)
    });
  }

  function dispatch (event, handlers) {
    const errors = [];
    for (const handler of handlers) {
      try {
        const result = handler(event);
        if (result && typeof result.then === 'function') {
          result.catch((error) => reportSubscriberError(error, event, handler));
        }
      } catch (error) {
        reportSubscriberError(error, event, handler);
        errors.push({ handler, error });
      }
    }
    return errors;
  }

  /**
   * Publishes one domain event synchronously to every current subscriber of
   * that type, then to every ALL_EVENTS subscriber. `aggregate` and
   * `version` are always taken from the registry, never from the caller --
   * this is what makes the registry the single source of truth (design doc
   * section "Event registry").
   *
   * @param {string} eventType one of EVENT_TYPES.*
   * @param {{aggregateId: *, payload?: object, context?: object}} details
   * @returns {{event: import('../contracts/eventEnvelope.js').DomainEvent, errors: Array<{handler: Function, error: *}>}}
   */
  function publish (eventType, { aggregateId, payload = {}, context = {} } = {}) {
    assertKnownType(eventType);
    const contract = getEventContract(eventType);
    const event = createDomainEvent(eventType, {
      aggregate: contract.aggregate,
      aggregateId,
      version: contract.version,
      payload,
      metadata: createEventContext(context)
    });

    const specific = subscribers.get(eventType) || [];
    const errors = dispatch(event, [...specific, ...wildcardSubscribers]);
    return { event, errors };
  }

  /** @param {string|typeof ALL_EVENTS} eventType */
  function subscriberCountFor (eventType) {
    const list = listFor(eventType);
    return list ? list.length : 0;
  }

  /** Removes every subscriber from every event type. For tests -- an isolated bus (createEventBus()) rarely needs this outside a test's own teardown. */
  function clear () {
    subscribers.clear();
    wildcardSubscribers.length = 0;
  }

  return { publish, subscribe, unsubscribe, subscriberCountFor, clear };
}
