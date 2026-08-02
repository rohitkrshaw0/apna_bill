// contracts/voucherTypeContract.js
// The immutable shape of a voucher type (Milestone 15A "Voucher
// Infrastructure"). Metadata and discovery only -- no posting, no UI.
//
// ---------------------------------------------------------------------
// VOUCHER TYPE VS. POSTING PROVIDER -- WHAT ACTUALLY DISTINGUISHES THEM
// ---------------------------------------------------------------------
// A VoucherType is the DOCUMENT CLASS a user recognises -- "Sales
// Invoice", "Payment", "Journal", "Credit Note". It answers "what kind of
// document is this?" Its consumers are pickers, registers, filters, and
// reports.
//
// A PostingProvider (postingProviderContract.js) is the RULE that converts
// a source business document into balanced journal lines. It answers "who
// knows how to produce the double entry for this?"
//
// The relationship is many-to-one AND partial, which is why they are two
// registries, not one: one provider can serve several voucher types (a
// Sales posting provider produces both 'sales' and 'salesReturn'), and a
// voucher type can exist with NO provider at all -- a manual 'journal'
// voucher, where the user supplies the lines directly and there is
// nothing to generate. Collapsing them would force every manual voucher
// type to carry a null provider, and every multi-type provider to be
// registered once per type.
//
// numberingSeries is a HINT STRING ONLY. This application already has a
// real numbering system -- invoice_prefixes and next_invoice_number() in
// sale_rpc.sql, atomic and FY-scoped. This field must never shadow or
// duplicate it; it exists so a future voucher screen can label which
// series a voucher type intends to use, nothing more.

import { deepFreeze } from '../shared/freezeDeep.js';

/** Open string at validation time, not membership-enforced -- same rule as accountContract's category. */
export const VOUCHER_CATEGORIES = deepFreeze({
  SALES: 'sales',
  PURCHASE: 'purchase',
  PAYMENT: 'payment',
  RECEIPT: 'receipt',
  CONTRA: 'contra',
  JOURNAL: 'journal',
  INVENTORY: 'inventory'
});

/**
 * @typedef {object} VoucherTypeDefinition
 * @property {string} id unique, no ad hoc duplicates (enforced at registry register())
 * @property {string} code short code, also unique per registry
 * @property {string} name human-readable, e.g. 'Sales Invoice'
 * @property {string|null} abbreviation e.g. 'SI', for a compact document-number prefix
 * @property {string} category one of VOUCHER_CATEGORIES -- open string, not enum-enforced
 * @property {boolean} affectsInventory true when posting this voucher type also moves stock
 * @property {boolean} isSystemDefined true for a voucher type this platform itself defines,
 *   as opposed to one a future extension registers
 * @property {string|null} defaultNarration
 * @property {string|null} numberingSeries a hint string only -- see the header
 * @property {object} metadata
 */

/**
 * @param {object} fields
 * @returns {VoucherTypeDefinition}
 */
export function createVoucherTypeDefinition ({
  id, code, name, abbreviation = null, category,
  affectsInventory = false, isSystemDefined = false,
  defaultNarration = null, numberingSeries = null, metadata = {}
}) {
  assertValidVoucherTypeFields({ id, code, name, abbreviation, category, affectsInventory, isSystemDefined, defaultNarration, numberingSeries, metadata });

  return deepFreeze({
    id, code, name,
    abbreviation: abbreviation || null,
    category,
    affectsInventory: !!affectsInventory,
    isSystemDefined: !!isSystemDefined,
    defaultNarration: defaultNarration || null,
    numberingSeries: numberingSeries || null,
    metadata: { ...metadata }
  });
}

function assertValidVoucherTypeFields ({ id, code, name, abbreviation, category, affectsInventory, isSystemDefined, defaultNarration, numberingSeries, metadata }) {
  if (!id || typeof id !== 'string') throw new TypeError('createVoucherTypeDefinition: id is required');
  if (!code || typeof code !== 'string') throw new TypeError('createVoucherTypeDefinition: code is required');
  if (!name || typeof name !== 'string') throw new TypeError('createVoucherTypeDefinition: name is required');
  if (!category || typeof category !== 'string') throw new TypeError('createVoucherTypeDefinition: category is required');

  for (const [label, value] of [['abbreviation', abbreviation], ['defaultNarration', defaultNarration], ['numberingSeries', numberingSeries]]) {
    if (value !== null && value !== undefined && (typeof value !== 'string' || !value)) {
      throw new TypeError(`createVoucherTypeDefinition: ${label} must be a non-empty string when provided`);
    }
  }

  if (typeof affectsInventory !== 'boolean') throw new TypeError('createVoucherTypeDefinition: affectsInventory must be a boolean');
  if (typeof isSystemDefined !== 'boolean') throw new TypeError('createVoucherTypeDefinition: isSystemDefined must be a boolean');
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('createVoucherTypeDefinition: metadata must be a plain object');
  }
}

const REQUIRED_FIELDS = ['id', 'code', 'name', 'abbreviation', 'category', 'affectsInventory', 'isSystemDefined', 'defaultNarration', 'numberingSeries', 'metadata'];

/** @param {VoucherTypeDefinition} definition */
export function assertValidVoucherTypeDefinition (definition) {
  if (!definition || typeof definition !== 'object') throw new TypeError('assertValidVoucherTypeDefinition: definition must be an object');
  for (const key of REQUIRED_FIELDS) {
    if (!(key in definition)) throw new TypeError(`assertValidVoucherTypeDefinition: missing "${key}"`);
  }
  return true;
}
