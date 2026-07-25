// lifecycle/extensionLifecycleManager.js
// The Lifecycle Manager (Milestone 11F section "Lifecycle Manager"):
// register, initialize, start, stop, dispose -- plus one convenience,
// unregister(), that runs stop (if started) then dispose then removes
// the extension from both registries in one call ("unregister cleanly,"
// the demonstration's own last step).
//
// Ordering is enforced two ways:
//   1. Per-extension: each transition requires the extension to already
//      be in the correct prior state (initialize requires REGISTERED,
//      start requires INITIALIZED, stop requires STARTED, dispose
//      requires STARTED or STOPPED) -- calling them out of order throws.
//   2. Across extensions: start(id) additionally requires every
//      dependency this extension declared to already be STARTED --
//      giving `dependencies` real teeth beyond registration-time
//      validation (validation/dependencyValidator.js only checks a
//      dependency EXISTS and is version-compatible at register() time;
//      this checks it has actually been started, at start() time).
//
// Self-protection: every hook call is wrapped in its own try/catch
// (safeCall()) -- one extension's broken onInitialize/onStart/onStop/
// onDispose is caught, classified, logged via diagnostics, and NEVER
// rethrown, exactly the same failure-isolation pattern
// diagnostics/observer/eventObserver.js (11C), jobs/dispatcher/
// jobDispatcher.js (11D), and audit/subscriber/auditSubscriber.js (11E)
// already established. A broken extension can never crash the framework
// or block a sibling extension's own lifecycle.

import { eventBus as defaultEventBus, EVENT_TYPES } from '../../events/index.js';
import { createStructuredLogger, classifyError, describeError } from '../../diagnostics/index.js';
import { createAuditQueryApi, auditSubscriber as defaultAuditSubscriber } from '../../audit/index.js';
import { jobDispatcher as defaultJobDispatcher } from '../../jobs/index.js';
import { createExtensionRegistry } from '../registry/extensionRegistry.js';
import { createCapabilityRegistry } from '../registry/capabilityRegistry.js';
import { createExtensionContext } from '../context/extensionContext.js';

export const LIFECYCLE_STATE = Object.freeze({
  REGISTERED: 'registered',
  INITIALIZED: 'initialized',
  STARTED: 'started',
  STOPPED: 'stopped',
  DISPOSED: 'disposed'
});

/**
 * @param {object} [opts]
 * @param {ReturnType<import('../registry/extensionRegistry.js').createExtensionRegistry>} [opts.registry]
 * @param {ReturnType<import('../registry/capabilityRegistry.js').createCapabilityRegistry>} [opts.capabilityRegistry]
 * @param {ReturnType<import('../../events/index.js').createEventBus>} [opts.eventBus]
 * @param {{store: object, getRunHistory?: Function}} [opts.auditStore] an object satisfying assertValidAuditStore() -- defaults to the shared auditSubscriber's own store
 * @param {{getRunHistory: Function, isRunning: Function}} [opts.jobDispatcher]
 * @param {ReturnType<typeof createStructuredLogger>} [opts.logger] this manager's own logger
 * @param {{write: Function}} [opts.logSink] passed through to every extension's own ExtensionContext logger (context/extensionContext.js) -- lets a test observe an extension's own diagnostics output; defaults to console when omitted, same as the manager's own logger does.
 */
export function createExtensionLifecycleManager ({
  registry = createExtensionRegistry(),
  capabilityRegistry = createCapabilityRegistry(),
  eventBus = defaultEventBus,
  auditStore = defaultAuditSubscriber.store,
  jobDispatcher = defaultJobDispatcher,
  logger = createStructuredLogger({ name: 'extensions.lifecycle' }),
  logSink
} = {}) {
  /** @type {Map<string, string>} extension id -> LIFECYCLE_STATE */
  const states = new Map();
  /** @type {Map<string, object>} extension id -> its own ExtensionContext */
  const contexts = new Map();

  function getState (id) {
    return states.get(id) || null;
  }

  function assertState (id, expected, action) {
    const actual = getState(id);
    if (actual !== expected) {
      throw new TypeError(`extensionLifecycleManager.${action}: "${id}" must be "${expected}" to ${action}, but is "${actual || 'not registered'}"`);
    }
  }

  function safeCall (id, hookName, fn) {
    try {
      fn();
    } catch (error) {
      logger.error(`Extension "${id}" hook "${hookName}" failed`, {
        meta: { extensionId: id, hookName, error: describeError(error) }
      });
      // Never rethrown -- see header comment. A broken extension hook
      // never crashes the framework or blocks a sibling extension.
    }
  }

  /**
   * Validates (registry.register() itself runs the full Dependency
   * Validation pass) and registers a definition. Does not call any hook.
   * @param {import('../contracts/extensionContract.js').ExtensionDefinition} definition
   */
  function register (definition) {
    registry.register(definition);
    capabilityRegistry.registerCapabilities(definition.id, definition.capabilities);
    states.set(definition.id, LIFECYCLE_STATE.REGISTERED);
    logger.info(`Extension "${definition.id}" registered`, { meta: { version: definition.version, capabilities: definition.capabilities } });
    return definition;
  }

  /** @param {string} id */
  function initialize (id) {
    assertState(id, LIFECYCLE_STATE.REGISTERED, 'initialize');
    const definition = registry.get(id);
    const context = createExtensionContext({
      extensionId: id,
      eventBus, EVENT_TYPES,
      createStructuredLogger, classifyError, describeError,
      createAuditQueryApi, auditStore,
      jobDispatcher, capabilityRegistry, logSink
    });
    contexts.set(id, context);
    safeCall(id, 'onInitialize', () => definition.hooks.onInitialize?.(context));
    states.set(id, LIFECYCLE_STATE.INITIALIZED);
    logger.info(`Extension "${id}" initialized`);
  }

  /** @param {string} id */
  function start (id) {
    assertState(id, LIFECYCLE_STATE.INITIALIZED, 'start');
    const definition = registry.get(id);

    if (!registry.isEnabled(id)) {
      logger.warn(`Extension "${id}" is disabled -- start() skipped`, { meta: { extensionId: id } });
      return false;
    }

    // Dependency ordering (see header comment point 2): every declared
    // dependency must already be STARTED.
    for (const dep of definition.dependencies) {
      if (getState(dep.id) !== LIFECYCLE_STATE.STARTED) {
        throw new TypeError(`extensionLifecycleManager.start: "${id}" requires "${dep.id}" to be started first (currently "${getState(dep.id) || 'not registered'}")`);
      }
    }

    safeCall(id, 'onStart', () => definition.hooks.onStart?.(contexts.get(id)));
    states.set(id, LIFECYCLE_STATE.STARTED);
    logger.info(`Extension "${id}" started`);
    return true;
  }

  /** @param {string} id */
  function stop (id) {
    assertState(id, LIFECYCLE_STATE.STARTED, 'stop');
    const definition = registry.get(id);
    safeCall(id, 'onStop', () => definition.hooks.onStop?.(contexts.get(id)));
    states.set(id, LIFECYCLE_STATE.STOPPED);
    logger.info(`Extension "${id}" stopped`);
  }

  /** @param {string} id */
  function dispose (id) {
    const current = getState(id);
    const disposableFrom = [LIFECYCLE_STATE.INITIALIZED, LIFECYCLE_STATE.STARTED, LIFECYCLE_STATE.STOPPED];
    if (!disposableFrom.includes(current)) {
      throw new TypeError(`extensionLifecycleManager.dispose: "${id}" must be "initialized", "started", or "stopped" to dispose, but is "${current || 'not registered'}"`);
    }
    const definition = registry.get(id);
    safeCall(id, 'onDispose', () => definition.hooks.onDispose?.(contexts.get(id)));
    states.set(id, LIFECYCLE_STATE.DISPOSED);
    logger.info(`Extension "${id}" disposed`);
  }

  /**
   * Convenience for a clean teardown in one call: stop (if currently
   * started) -> dispose -> remove from both registries. Safe to call on
   * an extension that was only ever registered/initialized (never
   * started) -- it disposes directly.
   * @param {string} id
   */
  function unregister (id) {
    const current = getState(id);
    if (current === null) return false;
    if (current === LIFECYCLE_STATE.STARTED) stop(id);
    if (getState(id) === LIFECYCLE_STATE.STARTED || getState(id) === LIFECYCLE_STATE.STOPPED || getState(id) === LIFECYCLE_STATE.INITIALIZED) {
      dispose(id);
    }
    registry.remove(id);
    capabilityRegistry.unregisterCapabilities(id);
    contexts.delete(id);
    states.delete(id);
    logger.info(`Extension "${id}" unregistered`);
    return true;
  }

  return { register, initialize, start, stop, dispose, unregister, getState, registry, capabilityRegistry, LIFECYCLE_STATE };
}
