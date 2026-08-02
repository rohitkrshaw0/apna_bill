// registry/voucherTypeRegistry.js
// Central registration of voucher types (Milestone 15A "Voucher
// Registry" / "Voucher Discovery"). Same six-method Map-closure idiom as
// accountRegistry.js and reporting/registry/reportRegistry.js.
//
// Unlike accountRegistry, list() sorts by NAME, not code: a voucher type
// picker is alphabetical by name (there is no chart-of-accounts-style code
// ordering convention for voucher types), so the human-meaningful order
// differs per registry rather than being copied blindly from accounts.
//
// This registry IS the platform's extension point for voucher types: a
// future module registers one by calling register(definition) on the
// shared instance index.js exports.

import { assertValidVoucherTypeDefinition } from '../contracts/voucherTypeContract.js';

export function createVoucherTypeRegistry () {
  /** @type {Map<string, import('../contracts/voucherTypeContract.js').VoucherTypeDefinition>} */
  const definitions = new Map();
  /** @type {Map<string, string>} voucher type code -> id */
  const idsByCode = new Map();

  /**
   * @param {import('../contracts/voucherTypeContract.js').VoucherTypeDefinition} definition
   * @throws {TypeError} if the definition fails its contract check, or its id or code
   *   is already registered
   */
  function register (definition) {
    assertValidVoucherTypeDefinition(definition);
    if (definitions.has(definition.id)) {
      throw new TypeError(`voucherTypeRegistry.register: "${definition.id}" is already registered`);
    }
    if (idsByCode.has(definition.code)) {
      throw new TypeError(
        `voucherTypeRegistry.register: code "${definition.code}" is already registered (voucher type "${idsByCode.get(definition.code)}")`
      );
    }
    definitions.set(definition.id, definition);
    idsByCode.set(definition.code, definition.id);
    return definition;
  }

  function get (id) {
    return definitions.get(id) || null;
  }

  function getByCode (code) {
    const id = idsByCode.get(code);
    return id ? definitions.get(id) || null : null;
  }

  /** @returns {import('../contracts/voucherTypeContract.js').VoucherTypeDefinition[]} sorted by name */
  function list () {
    return [...definitions.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** @param {string} category @returns {import('../contracts/voucherTypeContract.js').VoucherTypeDefinition[]} sorted by name */
  function listByCategory (category) {
    return [...definitions.values()].filter((d) => d.category === category).sort((a, b) => a.name.localeCompare(b.name));
  }

  function has (id) {
    return definitions.has(id);
  }

  function unregister (id) {
    const existing = definitions.get(id);
    if (!existing) return false;
    definitions.delete(id);
    idsByCode.delete(existing.code);
    return true;
  }

  function clear () {
    definitions.clear();
    idsByCode.clear();
  }

  return { register, get, getByCode, list, listByCategory, has, unregister, clear };
}
