// registry/extensionRegistry.js
// Central registration of extensions (Milestone 11F section "Extension
// Registry"): no duplicate IDs, version tracking, enable/disable state.
// `register()` is the single gate every extension definition passes
// through -- it runs the full Dependency Validation pass
// (validation/dependencyValidator.js) before ever storing a definition,
// so a caller can never bypass duplicate/missing-dependency/version/
// circular-dependency checks by reaching into this registry some other
// way.
//
// "Enable/disable state" is deliberately separate from lifecycle state
// (register/initialize/start/stop/dispose, tracked by
// lifecycle/extensionLifecycleManager.js) -- a disabled extension can
// remain registered (its dependents can still see it exists and satisfy
// version checks against it) while the lifecycle manager simply never
// initializes/starts it.

import { validateExtension } from '../validation/dependencyValidator.js';

export function createExtensionRegistry () {
  /** @type {Map<string, import('../contracts/extensionContract.js').ExtensionDefinition>} */
  const definitions = new Map();
  /** @type {Map<string, boolean>} */
  const enabled = new Map();

  /**
   * @param {import('../contracts/extensionContract.js').ExtensionDefinition} definition
   * @throws {TypeError} if validation/dependencyValidator.js's validateExtension() finds any error
   */
  function register (definition) {
    const result = validateExtension(definition, {
      // A read-only view is enough for validation -- get()/list() are the
      // only two methods validateExtension() ever calls.
      get, list
    });
    if (!result.isValid) {
      const messages = result.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
      throw new TypeError(`extensionRegistry.register: "${definition.id}" failed validation -- ${messages}`);
    }
    definitions.set(definition.id, definition);
    enabled.set(definition.id, true);
    return definition;
  }

  /** @param {string} id @returns {import('../contracts/extensionContract.js').ExtensionDefinition|null} */
  function get (id) {
    return definitions.get(id) || null;
  }

  /** @returns {import('../contracts/extensionContract.js').ExtensionDefinition[]} */
  function list () {
    return [...definitions.values()];
  }

  /** Fully removes a definition and its enable/disable state -- used by unregister(). @param {string} id */
  function remove (id) {
    definitions.delete(id);
    enabled.delete(id);
  }

  /** @param {string} id @param {boolean} value */
  function setEnabled (id, value) {
    if (!definitions.has(id)) throw new TypeError(`extensionRegistry.setEnabled: "${id}" is not registered`);
    enabled.set(id, !!value);
  }

  /** @param {string} id @returns {boolean} */
  function isEnabled (id) {
    return enabled.get(id) === true;
  }

  /** @param {string} id @returns {string|null} */
  function getVersion (id) {
    return definitions.get(id)?.version ?? null;
  }

  function clear () {
    definitions.clear();
    enabled.clear();
  }

  return { register, get, list, remove, setEnabled, isEnabled, getVersion, clear };
}
