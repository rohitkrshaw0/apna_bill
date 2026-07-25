// context/extensionContext.js
// The Extension Context (Milestone 11F section "Extension Context"):
// "Provide controlled access to: Event Bus, Diagnostics, Audit Query API,
// Job Dispatcher. Do NOT expose internal ERP modules directly." This file
// imports only from events/, diagnostics/, and audit/'s public barrels
// (jobs/ access is passed in already-constructed, see below) -- never
// from dataExchange/ or any business file, confirmed by grep.
//
// Every surface here is deliberately narrower than the platform it
// wraps:
//
//   events       subscribe/unsubscribe/publish + EVENT_TYPES -- the same
//                capability any other Event Bus subscriber has (11C's
//                Diagnostics observer, 11D's Job Engine, 11E's Audit
//                Platform are all just other subscribers on this same
//                bus); an extension cannot register a brand-new event
//                TYPE without events/registry/eventTypes.js accepting
//                it, which this milestone must not modify.
//   diagnostics  one structured logger scoped to `extension.<id>`, plus
//                the pure classifyError/describeError functions -- an
//                extension can "write Diagnostics" but cannot start/stop
//                the shared diagnosticsObserver or reach any other
//                extension's own logger.
//   audit        createAuditQueryApi(store) ONLY -- read-only. An
//                extension can "query Audit" exactly as the brief says;
//                it cannot append/write a record itself (that remains
//                the Audit Subscriber's own, sole responsibility, 11E).
//   jobs         getRunHistory()/isRunning() ONLY -- read-only
//                observation of the Job Dispatcher. Extensions cannot
//                register new jobs through this context: jobs/registry/
//                jobIds.js is a closed catalog by 11D's own design ("no
//                ad hoc string literals... register() rejects any
//                definition whose id is not one of JOB_IDS"), and this
//                milestone must not modify the Job Engine to loosen that
//                catalog. Disclosed explicitly in
//                docs/milestone-11f-extension-framework-design.md
//                section "What Job Dispatcher access does NOT include."

/**
 * @param {object} opts
 * @param {string} opts.extensionId
 * @param {ReturnType<import('../../events/index.js').createEventBus>} opts.eventBus
 * @param {typeof import('../../events/index.js').EVENT_TYPES} opts.EVENT_TYPES
 * @param {(opts: object) => object} opts.createStructuredLogger
 * @param {(e: *) => string} opts.classifyError
 * @param {(e: *) => object} opts.describeError
 * @param {(store: object) => object} opts.createAuditQueryApi
 * @param {object} opts.auditStore any object satisfying assertValidAuditStore()
 * @param {{getRunHistory: Function, isRunning: Function}} opts.jobDispatcher
 * @param {ReturnType<import('../registry/capabilityRegistry.js').createCapabilityRegistry>} opts.capabilityRegistry
 * @param {{write: Function}} [opts.logSink] injectable sink for this extension's own logger -- defaults to console (createStructuredLogger's own default) when omitted; tests inject a memory sink here so an extension's own diagnostics output is observable.
 */
export function createExtensionContext ({
  extensionId, eventBus, EVENT_TYPES,
  createStructuredLogger, classifyError, describeError,
  createAuditQueryApi, auditStore,
  jobDispatcher, capabilityRegistry, logSink
}) {
  const logger = createStructuredLogger({ name: `extension.${extensionId}`, sink: logSink });
  const auditQuery = createAuditQueryApi(auditStore);

  return {
    events: {
      subscribe: (eventType, handler) => eventBus.subscribe(eventType, handler),
      unsubscribe: (eventType, handler) => eventBus.unsubscribe(eventType, handler),
      publish: (eventType, details) => eventBus.publish(eventType, details),
      EVENT_TYPES
    },
    diagnostics: {
      logger,
      classifyError,
      describeError
    },
    audit: {
      query: auditQuery
    },
    jobs: {
      getRunHistory: () => jobDispatcher.getRunHistory(),
      isRunning: () => jobDispatcher.isRunning()
    },
    capabilities: {
      getProviders: (capability) => capabilityRegistry.getProviders(capability),
      hasCapability: (capability) => capabilityRegistry.hasCapability(capability)
    }
  };
}
