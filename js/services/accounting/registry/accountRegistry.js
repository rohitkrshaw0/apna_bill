// registry/accountRegistry.js
// Central registration of accounts -- the Chart of Accounts itself
// (Milestone 15A "Account Registry" / "Parent Child Hierarchy").
//
// Modeled on reporting/registry/reportRegistry.js's shape, which in turn
// followed extensions/registry/extensionRegistry.js: a dynamic registry
// with a duplicate-id check at register() time, rather than the Job
// Engine's fixed JOB_IDS enum, because a chart of accounts is registered
// incrementally and differs per company -- it is not a small fixed set
// known upfront.
//
// This registry IS the platform's extension point for accounts: any future
// module contributes an account by calling register(definition) on the
// shared instance index.js exports. No change to this file, and no change
// to the frozen Extension Framework, is needed to add one.
//
// ---------------------------------------------------------------------
// THREE DELIBERATE ADDITIONS OVER THE SIX-METHOD BASE
// ---------------------------------------------------------------------
// 1. Duplicate `code` is rejected as well as duplicate `id`. A chart of
//    accounts with two ledgers sharing code '1100' is corrupt. The second
//    Map that enforces it is also what makes getByCode() O(1).
//
// 2. A `parentId` must already be registered. This mirrors the missing-
//    dependency rejection in extensions/validation/dependencyValidator.js,
//    and it has a useful consequence worth stating plainly: BECAUSE A
//    PARENT MUST ALREADY EXIST, A HIERARCHY CYCLE IS IMPOSSIBLE BY
//    CONSTRUCTION. There is no cycle detector here and none is needed --
//    unlike detectCircularDependency() in extensions, where dependencies
//    may be declared against not-yet-registered ids. An ordering
//    constraint replaces a whole file of graph code.
//
// 3. list() sorts by `code`, not by name. The six-method idiom says
//    "sorted by a human field"; for a chart of accounts the human-
//    meaningful order is code order, which is what every trial balance and
//    ledger index prints. localeCompare with { numeric: true } so '9'
//    sorts before '10'.

import { assertValidAccountDefinition } from '../contracts/accountContract.js';

export function createAccountRegistry () {
  /** @type {Map<string, import('../contracts/accountContract.js').AccountDefinition>} */
  const definitions = new Map();
  /** @type {Map<string, string>} account code -> account id */
  const idsByCode = new Map();

  const byCode = (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true });

  /**
   * @param {import('../contracts/accountContract.js').AccountDefinition} definition
   * @throws {TypeError} if the definition fails its contract check, its id or code is
   *   already registered, or its parentId is not registered
   */
  function register (definition) {
    assertValidAccountDefinition(definition);

    if (definitions.has(definition.id)) {
      throw new TypeError(`accountRegistry.register: "${definition.id}" is already registered`);
    }
    if (idsByCode.has(definition.code)) {
      throw new TypeError(
        `accountRegistry.register: code "${definition.code}" is already registered (account "${idsByCode.get(definition.code)}")`
      );
    }
    if (definition.parentId !== null && !definitions.has(definition.parentId)) {
      throw new TypeError(
        `accountRegistry.register: "${definition.id}" declares parent "${definition.parentId}", which is not registered -- register the parent first`
      );
    }

    definitions.set(definition.id, definition);
    idsByCode.set(definition.code, definition.id);
    return definition;
  }

  /** @param {string} id @returns {import('../contracts/accountContract.js').AccountDefinition|null} */
  function get (id) {
    return definitions.get(id) || null;
  }

  /** @param {string} code @returns {import('../contracts/accountContract.js').AccountDefinition|null} */
  function getByCode (code) {
    const id = idsByCode.get(code);
    return id ? definitions.get(id) || null : null;
  }

  /** @returns {import('../contracts/accountContract.js').AccountDefinition[]} sorted by code */
  function list () {
    return [...definitions.values()].sort(byCode);
  }

  /** @param {string} category @returns {import('../contracts/accountContract.js').AccountDefinition[]} sorted by code */
  function listByCategory (category) {
    return [...definitions.values()].filter((d) => d.category === category).sort(byCode);
  }

  /**
   * Direct children only -- this registry stores a parent link, not a tree,
   * and deliberately does not walk descendants. A future consumer that
   * needs a full subtree composes this call; baking recursion in here would
   * be a traversal policy no consumer has asked for yet.
   * @param {string|null} parentId null lists root accounts
   * @returns {import('../contracts/accountContract.js').AccountDefinition[]} sorted by code
   */
  function listChildren (parentId) {
    const target = parentId || null;
    return [...definitions.values()].filter((d) => d.parentId === target).sort(byCode);
  }

  /** @param {string} id @returns {boolean} */
  function has (id) {
    return definitions.has(id);
  }

  /**
   * @param {string} id
   * @returns {boolean} true if a definition was actually removed
   * @throws {TypeError} if some other account still declares this one as its parent --
   *   removing it would leave an orphan whose parent claim is false, and would break
   *   the no-cycles-by-construction guarantee register() relies on
   */
  function unregister (id) {
    const existing = definitions.get(id);
    if (!existing) return false;

    const children = [...definitions.values()].filter((d) => d.parentId === id);
    if (children.length > 0) {
      throw new TypeError(
        `accountRegistry.unregister: "${id}" has child accounts (${children.map((c) => c.id).join(', ')}) -- unregister them first`
      );
    }

    definitions.delete(id);
    idsByCode.delete(existing.code);
    return true;
  }

  function clear () {
    definitions.clear();
    idsByCode.clear();
  }

  return { register, get, getByCode, list, listByCategory, listChildren, has, unregister, clear };
}
