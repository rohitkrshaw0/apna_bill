// services/events/index.js
// Public barrel for the Domain Event Bus (Milestone 11A). Every consumer --
// future Background Jobs (11B), Diagnostics (11C), Audit (11D), Plugin
// System (11E), or any current module that wants to start publishing --
// imports from here, never from an individual subfolder, same convention
// dataExchange/, xml/, json/, apnabill/ all already follow.
//
// `eventBus` is the one shared, application-wide bus instance real call
// sites should use so every subscriber sees the same event stream.
// `createEventBus()` is exported too, for tests and for any deliberately
// isolated instance (e.g. a per-test bus with its own subscriber set).

import { createEventBus } from './bus/eventBus.js';

export { AGGREGATES, EVENT_TYPES, getEventContract, isKnownEventType, listEventTypes } from './registry/eventTypes.js';
export { EVENT_ENVELOPE_VERSION, createDomainEvent, assertValidDomainEvent } from './contracts/eventEnvelope.js';
export { createEventContext } from './context/eventContext.js';
export { ALL_EVENTS, createEventBus } from './bus/eventBus.js';
export { createLogger, createConsoleSink, createMemorySink } from './shared/logging/index.js';

/** The application-wide Domain Event Bus instance. Import this to publish or subscribe from real code. */
export const eventBus = createEventBus();
