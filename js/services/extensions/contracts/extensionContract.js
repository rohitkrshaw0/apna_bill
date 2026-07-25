// contracts/extensionContract.js
// The one, permanent shape every extension conforms to (Milestone 11F
// section "Extension Contract"). Every field the brief lists, exactly:
// id, name, version, description, author, capabilities, dependencies,
// lifecycle hooks.
//
// `capabilities` (string[]) is what this extension PROVIDES -- other
// extensions discover it via registry/capabilityRegistry.js rather than
// hardcoding this extension's id (see that file's own header comment on
// why "declare capabilities instead of directly coupling to other
// extensions" is a real decoupling mechanism, not decoration).
//
// `dependencies` ({id, minVersion?}[]) is what this extension REQUIRES
// to already be registered (and, optionally, at least at a given
// version) before it can itself be registered -- validated by
// validation/dependencyValidator.js at registration time, and enforced
// again at start() time (lifecycle/extensionLifecycleManager.js) so an
// extension never starts before a dependency it declared has started.
//
// `hooks` are the four lifecycle callbacks
// (onInitialize/onStart/onStop/onDispose), every one optional -- an
// extension that only needs some phases simply omits the rest. Each
// receives the one argument every hook gets: this extension's own
// ExtensionContext (context/extensionContext.js), never a raw ERP
// module.

import { deepFreeze } from '../shared/freezeDeep.js';

/**
 * @typedef {object} ExtensionDependency
 * @property {string} id another extension's id
 * @property {string} [minVersion] e.g. "1.0.0" -- omit to accept any registered version
 */

/**
 * @typedef {object} ExtensionHooks
 * @property {(context: object) => void} [onInitialize]
 * @property {(context: object) => void} [onStart]
 * @property {(context: object) => void} [onStop]
 * @property {(context: object) => void} [onDispose]
 */

/**
 * @typedef {object} ExtensionDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} version e.g. "1.0.0"
 * @property {string} description
 * @property {string} author
 * @property {string[]} capabilities
 * @property {ExtensionDependency[]} dependencies
 * @property {ExtensionHooks} hooks
 */

/**
 * @param {object} fields
 * @returns {ExtensionDefinition}
 */
export function createExtensionDefinition ({
  id, name, version, description, author,
  capabilities = [], dependencies = [], hooks = {}
}) {
  assertValidExtensionFields({ id, name, version, description, author, capabilities, dependencies, hooks });

  return deepFreeze({
    id, name, version, description, author,
    capabilities: [...capabilities],
    dependencies: dependencies.map((d) => ({ id: d.id, minVersion: d.minVersion || null })),
    hooks: {
      onInitialize: hooks.onInitialize || null,
      onStart: hooks.onStart || null,
      onStop: hooks.onStop || null,
      onDispose: hooks.onDispose || null
    }
  });
}

function assertValidExtensionFields ({ id, name, version, description, author, capabilities, dependencies, hooks }) {
  if (!id || typeof id !== 'string') throw new TypeError('createExtensionDefinition: id is required');
  if (!name || typeof name !== 'string') throw new TypeError('createExtensionDefinition: name is required');
  if (!version || typeof version !== 'string') throw new TypeError('createExtensionDefinition: version is required (e.g. "1.0.0")');
  if (!description || typeof description !== 'string') throw new TypeError('createExtensionDefinition: description is required');
  if (!author || typeof author !== 'string') throw new TypeError('createExtensionDefinition: author is required');
  if (!Array.isArray(capabilities)) throw new TypeError('createExtensionDefinition: capabilities must be an array');
  if (!Array.isArray(dependencies)) throw new TypeError('createExtensionDefinition: dependencies must be an array');
  if (dependencies.some((d) => !d || typeof d.id !== 'string')) throw new TypeError('createExtensionDefinition: every dependency needs an "id"');
  if (hooks && typeof hooks !== 'object') throw new TypeError('createExtensionDefinition: hooks must be an object');
  for (const hookName of ['onInitialize', 'onStart', 'onStop', 'onDispose']) {
    if (hooks[hookName] !== undefined && typeof hooks[hookName] !== 'function') {
      throw new TypeError(`createExtensionDefinition: hooks.${hookName} must be a function if provided`);
    }
  }
}

const REQUIRED_FIELDS = ['id', 'name', 'version', 'description', 'author', 'capabilities', 'dependencies', 'hooks'];

/**
 * Structural contract check.
 * @param {ExtensionDefinition} definition
 */
export function assertValidExtensionDefinition (definition) {
  if (!definition || typeof definition !== 'object') throw new TypeError('assertValidExtensionDefinition: definition must be an object');
  for (const key of REQUIRED_FIELDS) {
    if (!(key in definition)) throw new TypeError(`assertValidExtensionDefinition: missing "${key}"`);
  }
  return true;
}
