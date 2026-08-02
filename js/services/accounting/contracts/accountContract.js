// contracts/accountContract.js
// The one, permanent shape every Chart of Accounts entry conforms to
// (Milestone 15A "Chart of Accounts Foundation" / "Account Categories" /
// "Account Types" / "Normal Balance Framework"). Pure metadata -- no
// balance, no ledger, no calculation. An account definition describes what
// an account IS so the registry, a future ledger, and a future trial
// balance can discover and present it generically.
//
// ---------------------------------------------------------------------
// OPEN CATALOGS, CLOSED DERIVATION TABLE (ADR-0010)
// ---------------------------------------------------------------------
// ACCOUNT_CATEGORIES and ACCOUNT_TYPES are catalogs, not closed enums:
// `category` and `type` are validated as non-empty strings, NOT as
// membership. That is the same rule reporting/contracts/reportContract.js
// already applies to its own category/dataSource, and for the same stated
// reason -- future categories are expected to grow beyond what this
// milestone can name.
//
// But accounting has a constraint reporting did not: normal-balance
// DERIVATION needs to know the category. A fully open set makes derivation
// impossible for an unknown value. The reconciliation:
//
//   The catalog is open. The derivation table is closed. An account whose
//   category is not in the derivation table must declare its normalBalance
//   explicitly.
//
// gst, suspense and control are deliberately ABSENT from the derivation
// table. This is not an oversight to be "fixed": Input GST is an asset
// (debit-normal) and Output GST is a liability (credit-normal), so the
// category genuinely has no single normal balance. The same is true of
// Suspense and Control. Their absence makes the "must declare" rule do
// real work from day one, against three concrete cases inside the catalog
// itself, rather than existing only for hypothetical future categories.
//
// NORMAL_BALANCES and ACCOUNT_STATUS, by contrast, ARE membership-enforced.
// They are closed by nature: there is no third side to an entry, and there
// is no meaningful custom account status without a persistence or approval
// model this milestone does not build.
//
// ---------------------------------------------------------------------
// DECLARED != DERIVED IS LEGAL
// ---------------------------------------------------------------------
// A contra account is a standard construct, not an error: Accumulated
// Depreciation is fixedAssets + credit-normal; Sales Returns is income +
// debit-normal. Enforcing agreement between a declared normalBalance and
// its derived default would forbid them. isContraAccount() exposes the
// distinction so this permissiveness reads as a decision rather than a
// missing check.

import { deepFreeze } from '../shared/freezeDeep.js';

export const ACCOUNT_CATEGORIES = deepFreeze({
  ASSETS: 'assets',
  CURRENT_ASSETS: 'currentAssets',
  FIXED_ASSETS: 'fixedAssets',
  LIABILITIES: 'liabilities',
  CURRENT_LIABILITIES: 'currentLiabilities',
  EQUITY: 'equity',
  INCOME: 'income',
  EXPENSES: 'expenses',
  DIRECT_EXPENSES: 'directExpenses',
  INDIRECT_EXPENSES: 'indirectExpenses',
  BANK: 'bank',
  CASH: 'cash',
  RECEIVABLE: 'receivable',
  PAYABLE: 'payable',
  GST: 'gst',
  SUSPENSE: 'suspense',
  CONTROL: 'control'
});

export const ACCOUNT_TYPES = deepFreeze({
  CASH: 'cash',
  BANK: 'bank',
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier',
  INVENTORY: 'inventory',
  TAX: 'tax',
  EXPENSE: 'expense',
  INCOME: 'income',
  CAPITAL: 'capital',
  LOAN: 'loan',
  ADJUSTMENT: 'adjustment',
  OPENING_BALANCE: 'openingBalance',
  CLOSING_BALANCE: 'closingBalance'
});

/** Closed by nature -- an entry has exactly two sides. */
export const NORMAL_BALANCES = deepFreeze({
  DEBIT: 'debit',
  CREDIT: 'credit'
});

/** Closed -- a richer status set needs a workflow model this milestone does not build. */
export const ACCOUNT_STATUS = deepFreeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive'
});

// The closed derivation table. Reached only through deriveNormalBalance();
// not exported, so no consumer can grow its own opinion of what a category
// means. gst/suspense/control are absent on purpose -- see the header.
const NORMAL_BALANCE_BY_CATEGORY = deepFreeze({
  [ACCOUNT_CATEGORIES.ASSETS]: NORMAL_BALANCES.DEBIT,
  [ACCOUNT_CATEGORIES.CURRENT_ASSETS]: NORMAL_BALANCES.DEBIT,
  [ACCOUNT_CATEGORIES.FIXED_ASSETS]: NORMAL_BALANCES.DEBIT,
  [ACCOUNT_CATEGORIES.BANK]: NORMAL_BALANCES.DEBIT,
  [ACCOUNT_CATEGORIES.CASH]: NORMAL_BALANCES.DEBIT,
  [ACCOUNT_CATEGORIES.RECEIVABLE]: NORMAL_BALANCES.DEBIT,
  [ACCOUNT_CATEGORIES.EXPENSES]: NORMAL_BALANCES.DEBIT,
  [ACCOUNT_CATEGORIES.DIRECT_EXPENSES]: NORMAL_BALANCES.DEBIT,
  [ACCOUNT_CATEGORIES.INDIRECT_EXPENSES]: NORMAL_BALANCES.DEBIT,
  [ACCOUNT_CATEGORIES.LIABILITIES]: NORMAL_BALANCES.CREDIT,
  [ACCOUNT_CATEGORIES.CURRENT_LIABILITIES]: NORMAL_BALANCES.CREDIT,
  [ACCOUNT_CATEGORIES.EQUITY]: NORMAL_BALANCES.CREDIT,
  [ACCOUNT_CATEGORIES.INCOME]: NORMAL_BALANCES.CREDIT,
  [ACCOUNT_CATEGORIES.PAYABLE]: NORMAL_BALANCES.CREDIT
});

/**
 * @param {string} category
 * @returns {string|null} a NORMAL_BALANCES value, or null when the category
 *   has no unambiguous default (gst/suspense/control, or any custom category)
 */
export function deriveNormalBalance (category) {
  return NORMAL_BALANCE_BY_CATEGORY[category] ?? null;
}

/**
 * @typedef {object} AccountDefinition
 * @property {string} id unique, no ad hoc duplicates (enforced at registry register())
 * @property {string} code the chart-of-accounts code, e.g. '1100' -- also unique per registry
 * @property {string} name human-readable ledger name
 * @property {string} category one of ACCOUNT_CATEGORIES -- open string, not enum-enforced
 * @property {string} type one of ACCOUNT_TYPES -- open string, not enum-enforced
 * @property {string} normalBalance a NORMAL_BALANCES value; derived from category when omitted,
 *   required explicitly when the category has no unambiguous default
 * @property {string|null} parentId parent account for hierarchy; null for a root account
 * @property {boolean} isReserved a system account a future milestone may protect from edit/delete
 * @property {string} status one of ACCOUNT_STATUS
 * @property {string|null} description
 * @property {object} metadata flat, caller-owned custom attributes (see the freeze note below)
 */

/**
 * @param {object} fields
 * @returns {AccountDefinition}
 */
export function createAccountDefinition ({
  id, code, name, category, type,
  normalBalance = null, parentId = null, isReserved = false,
  status = ACCOUNT_STATUS.ACTIVE, description = null, metadata = {}
}) {
  assertValidAccountFields({ id, code, name, category, type, normalBalance, parentId, isReserved, status, description, metadata });

  const resolvedNormalBalance = normalBalance || deriveNormalBalance(category);
  if (!resolvedNormalBalance) {
    throw new TypeError(
      `createAccountDefinition: category "${category}" has no default normal balance -- declare normalBalance explicitly`
    );
  }

  // metadata is spread (a shallow copy) and then deep-frozen. A nested
  // object the caller passed in is therefore frozen in place -- a real
  // side effect on caller-owned data, the same characteristic
  // reporting's own array copies have. metadata is documented as a flat
  // plain object for this reason; structuredClone is not reached for
  // without a consumer that needs it.
  return deepFreeze({
    id,
    code,
    name,
    category,
    type,
    normalBalance: resolvedNormalBalance,
    parentId: parentId || null,
    isReserved: !!isReserved,
    status,
    description: description || null,
    metadata: { ...metadata }
  });
}

function assertValidAccountFields ({ id, code, name, category, type, normalBalance, parentId, isReserved, status, description, metadata }) {
  if (!id || typeof id !== 'string') throw new TypeError('createAccountDefinition: id is required');
  if (!code || typeof code !== 'string') throw new TypeError('createAccountDefinition: code is required');
  if (!name || typeof name !== 'string') throw new TypeError('createAccountDefinition: name is required');
  if (!category || typeof category !== 'string') throw new TypeError('createAccountDefinition: category is required');
  if (!type || typeof type !== 'string') throw new TypeError('createAccountDefinition: type is required');

  if (normalBalance !== null && normalBalance !== undefined) {
    if (!Object.values(NORMAL_BALANCES).includes(normalBalance)) {
      throw new TypeError(
        `createAccountDefinition: normalBalance must be one of ${Object.values(NORMAL_BALANCES).join(', ')} when provided, received "${normalBalance}"`
      );
    }
  }

  if (parentId !== null && parentId !== undefined) {
    if (typeof parentId !== 'string' || !parentId) {
      throw new TypeError('createAccountDefinition: parentId must be a non-empty string when provided');
    }
    // Self-parenting is unambiguously wrong and cheap to catch here. Deeper
    // cycles are impossible by construction at the registry, which requires
    // a parent to already be registered -- see registry/accountRegistry.js.
    if (parentId === id) {
      throw new TypeError(`createAccountDefinition: "${id}" cannot be its own parent`);
    }
  }

  if (typeof isReserved !== 'boolean') {
    throw new TypeError('createAccountDefinition: isReserved must be a boolean');
  }

  if (!Object.values(ACCOUNT_STATUS).includes(status)) {
    throw new TypeError(
      `createAccountDefinition: status must be one of ${Object.values(ACCOUNT_STATUS).join(', ')}, received "${status}"`
    );
  }

  if (description !== null && description !== undefined && typeof description !== 'string') {
    throw new TypeError('createAccountDefinition: description must be a string when provided');
  }

  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('createAccountDefinition: metadata must be a plain object');
  }
}

const REQUIRED_FIELDS = ['id', 'code', 'name', 'category', 'type', 'normalBalance', 'parentId', 'isReserved', 'status', 'description', 'metadata'];

/**
 * Structural contract check -- key presence only. This is what the registry
 * gates on; createAccountDefinition above is what validates field types.
 * @param {AccountDefinition} definition
 */
export function assertValidAccountDefinition (definition) {
  if (!definition || typeof definition !== 'object') throw new TypeError('assertValidAccountDefinition: definition must be an object');
  for (const key of REQUIRED_FIELDS) {
    if (!(key in definition)) throw new TypeError(`assertValidAccountDefinition: missing "${key}"`);
  }
  return true;
}

/**
 * @param {AccountDefinition} definition
 * @returns {boolean}
 */
export function isDebitNormal (definition) {
  return definition?.normalBalance === NORMAL_BALANCES.DEBIT;
}

/**
 * A contra account: one whose declared normal balance deliberately opposes
 * its category's default (Accumulated Depreciation, Sales Returns). Legal,
 * and the reason declared != derived is permitted rather than rejected.
 * @param {AccountDefinition} definition
 * @returns {boolean} false when the category has no default to oppose
 */
export function isContraAccount (definition) {
  const derived = deriveNormalBalance(definition?.category);
  return derived !== null && derived !== definition?.normalBalance;
}
