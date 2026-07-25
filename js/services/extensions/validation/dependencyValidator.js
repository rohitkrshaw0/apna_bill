// validation/dependencyValidator.js
// Dependency Validation (Milestone 11F section "Dependency Validation"):
// duplicate IDs, missing dependencies, version compatibility, circular
// dependencies. `validateExtension()` is the single entry point
// registry/extensionRegistry.js's own `register()` calls before ever
// accepting a definition -- nothing under extensions/ registers a
// definition through any other path.

import { satisfiesMinVersion } from '../shared/semver.js';

/** @param {import('../contracts/extensionContract.js').ExtensionDefinition} definition @param {ReturnType<import('../registry/extensionRegistry.js').createExtensionRegistry>} registry */
export function isDuplicateId (definition, registry) {
  return registry.get(definition.id) !== null;
}

/** @returns {{id: string, minVersion: string|null}[]} dependencies with no matching registered extension */
export function findMissingDependencies (definition, registry) {
  return definition.dependencies.filter((dep) => registry.get(dep.id) === null);
}

/** @returns {{dependencyId: string, required: string, actual: string}[]} */
export function findIncompatibleVersions (definition, registry) {
  const incompatible = [];
  for (const dep of definition.dependencies) {
    const existing = registry.get(dep.id);
    if (existing && dep.minVersion && !satisfiesMinVersion(existing.version, dep.minVersion)) {
      incompatible.push({ dependencyId: dep.id, required: dep.minVersion, actual: existing.version });
    }
  }
  return incompatible;
}

/**
 * DFS cycle detection over the dependency graph formed by every
 * already-registered extension PLUS the candidate `definition` being
 * validated (which is not yet in the registry).
 * @returns {boolean}
 */
export function detectCircularDependency (definition, registry) {
  const graph = new Map();
  for (const existing of registry.list()) graph.set(existing.id, existing.dependencies.map((d) => d.id));
  graph.set(definition.id, definition.dependencies.map((d) => d.id));

  const visiting = new Set();
  const visited = new Set();

  function hasCycle (id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const depId of (graph.get(id) || [])) {
      if (hasCycle(depId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  return hasCycle(definition.id);
}

/**
 * @typedef {object} ValidationError
 * @property {string} code one of DUPLICATE_ID/MISSING_DEPENDENCY/VERSION_INCOMPATIBLE/CIRCULAR_DEPENDENCY
 * @property {string} message
 */

/**
 * @param {import('../contracts/extensionContract.js').ExtensionDefinition} definition
 * @param {ReturnType<import('../registry/extensionRegistry.js').createExtensionRegistry>} registry
 * @returns {{isValid: boolean, errors: ValidationError[]}}
 */
export function validateExtension (definition, registry) {
  const errors = [];

  if (isDuplicateId(definition, registry)) {
    errors.push({ code: 'DUPLICATE_ID', message: `An extension with id "${definition.id}" is already registered.` });
  }

  for (const missing of findMissingDependencies(definition, registry)) {
    errors.push({ code: 'MISSING_DEPENDENCY', message: `"${definition.id}" requires "${missing.id}", which is not registered.`, dependencyId: missing.id });
  }

  for (const bad of findIncompatibleVersions(definition, registry)) {
    errors.push({
      code: 'VERSION_INCOMPATIBLE',
      message: `"${definition.id}" requires "${bad.dependencyId}" >= ${bad.required}, but ${bad.actual} is registered.`,
      ...bad
    });
  }

  // Only meaningful once the id/missing-dependency checks above have
  // passed -- a duplicate or dangling dependency would make the cycle
  // check's own graph nonsensical (e.g. cycling through a node that will
  // never actually be registered).
  if (!isDuplicateId(definition, registry) && findMissingDependencies(definition, registry).length === 0) {
    if (detectCircularDependency(definition, registry)) {
      errors.push({ code: 'CIRCULAR_DEPENDENCY', message: `Registering "${definition.id}" would create a circular dependency.` });
    }
  }

  return { isValid: errors.length === 0, errors };
}
