// registry/postingProviderRegistry.js
// Central registration of posting providers (Milestone 15A "Posting
// Registry"). Same six-method Map-closure idiom, plus two lookups the
// voucherTypes field on a PostingProviderDefinition exists to serve.
//
// findProvidersForVoucherType() is modeled on
// extensions/registry/capabilityRegistry.js's getProviders() and is
// DELIBERATELY DUMB, the same way that file's own header describes
// itself: it returns a possibly-empty, possibly-multi-element list and
// does NOT rank providers, does NOT enforce exactly one provider per
// voucher type, and does NOT auto-resolve "the" provider for a voucher
// type. Resolving a conflict between two providers claiming the same
// voucher type is a 15B posting-pipeline decision, not a registry concern.

import { assertValidPostingProviderDefinition } from '../contracts/postingProviderContract.js';

export function createPostingProviderRegistry () {
  /** @type {Map<string, import('../contracts/postingProviderContract.js').PostingProviderDefinition>} */
  const definitions = new Map();

  /**
   * @param {import('../contracts/postingProviderContract.js').PostingProviderDefinition} definition
   * @throws {TypeError} if the definition fails its contract check, or its id is already registered
   */
  function register (definition) {
    assertValidPostingProviderDefinition(definition);
    if (definitions.has(definition.id)) {
      throw new TypeError(`postingProviderRegistry.register: "${definition.id}" is already registered`);
    }
    definitions.set(definition.id, definition);
    return definition;
  }

  function get (id) {
    return definitions.get(id) || null;
  }

  /** @returns {import('../contracts/postingProviderContract.js').PostingProviderDefinition[]} sorted by name */
  function list () {
    return [...definitions.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** @param {string} sourceModule @returns {import('../contracts/postingProviderContract.js').PostingProviderDefinition[]} sorted by name */
  function listBySourceModule (sourceModule) {
    return [...definitions.values()].filter((d) => d.sourceModule === sourceModule).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Deliberately dumb -- see the header. Never ranks, never picks "the" provider.
   * @param {string} voucherTypeId
   * @returns {import('../contracts/postingProviderContract.js').PostingProviderDefinition[]}
   */
  function findProvidersForVoucherType (voucherTypeId) {
    return [...definitions.values()].filter((d) => d.voucherTypes.includes(voucherTypeId));
  }

  function has (id) {
    return definitions.has(id);
  }

  function unregister (id) {
    return definitions.delete(id);
  }

  function clear () {
    definitions.clear();
  }

  return { register, get, list, listBySourceModule, findProvidersForVoucherType, has, unregister, clear };
}
