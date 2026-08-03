// resolution/accountResolutionService.js
// Resolves a business ROLE (see accountResolutionContract.js) to a real
// accountId for one company (Milestone 15B design decision #6). This is
// the ONLY module a posting provider is allowed to reach for chart-of-
// accounts data through -- providers receive a resolver instance, call
// resolve()/resolveMany() on it, and never see accounting_settings, the
// accounts table, or a Supabase client themselves.
//
// ---------------------------------------------------------------------
// NOT A SINGLETON -- SAME REASON fiscalPeriodService ISN'T ONE
// ---------------------------------------------------------------------
// A resolved role set is per-company (accounting_settings.account_map)
// and per-company chart of accounts (accounts.company_id). A shared
// module-level instance would bake one company's mapping into every
// caller. A resolver is constructed by whoever is posting for a specific
// company -- the posting façade, per call (or cached per company by the
// façade's own caller; this module has no opinion on caching lifetime).
//
// ---------------------------------------------------------------------
// WHY THIS TALKS TO accountRegistry RATHER THAN QUERYING accounts DIRECTLY
// ---------------------------------------------------------------------
// The Chart of Accounts registry (Milestone 15A) already carries the
// invariants a resolver needs to trust -- no duplicate codes, parent
// existence, a derived/declared normal balance. load() populates a
// caller-supplied accountRegistry from the accounts table once, and every
// resolve() call afterwards is a pure, synchronous in-memory lookup. This
// also means a test can inject a pre-populated registry and skip Supabase
// entirely -- the same collaborator-injection shape
// validateJournalEntry() already uses for accountRegistry/fiscalPeriodService.

import { supa } from '../../../supabaseClient.js';
import { createAccountDefinition } from '../contracts/accountContract.js';
import { createAccountRegistry } from '../registry/accountRegistry.js';
import { AccountResolutionError, RESOLUTION_ERROR_CODES } from './accountResolutionContract.js';

/**
 * @param {object} opts
 * @param {string} opts.companyId
 * @param {ReturnType<typeof createAccountRegistry>} [opts.accountRegistry]
 *   injectable (a test can pre-populate one and skip Supabase entirely, or
 *   share the app's own chart-of-accounts registry instance); defaults to a
 *   fresh registry owned by this service instance, scoped to companyId
 * @param {object} [opts.supabaseClient] injectable for tests; defaults to the real client
 */
export function createAccountResolutionService ({ companyId, accountRegistry = createAccountRegistry(), supabaseClient = supa } = {}) {
  if (!companyId || typeof companyId !== 'string') {
    throw new TypeError('createAccountResolutionService: companyId is required');
  }

  const registry = accountRegistry;
  /** @type {Record<string, string>|null} role -> accountId, null until load() */
  let roleMap = null;

  /** Registers accounts in parent-before-child order -- accountRegistry.register() requires a parent to already exist. */
  function registerInTopologicalOrder (rows) {
    const remaining = [...rows];
    let progressed = true;
    while (remaining.length > 0 && progressed) {
      progressed = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const row = remaining[i];
        if (row.parent_id && !registry.has(row.parent_id)) continue;
        registry.register(createAccountDefinition({
          id: row.id,
          code: row.code,
          name: row.name,
          category: row.category,
          type: row.type,
          normalBalance: row.normal_balance,
          parentId: row.parent_id || null,
          isReserved: row.is_reserved,
          status: row.status,
          description: row.description,
          metadata: row.metadata || {}
        }));
        remaining.splice(i, 1);
        progressed = true;
      }
    }
    if (remaining.length > 0) {
      // Every remaining row's parent_id points at something never seen
      // (data corruption, since the DB's own fk would otherwise have
      // rejected it) -- surfaced loudly rather than silently dropped.
      throw new TypeError(
        `accountResolutionService.load: ${remaining.length} account(s) reference an unregistered parent: ${remaining.map((r) => r.id).join(', ')}`
      );
    }
  }

  /** Fetches this company's active chart of accounts and role mapping. Safe to call more than once (rebuilds from scratch). */
  async function load () {
    const [accountsResult, settingsResult] = await Promise.all([
      supabaseClient.from('accounts').select('*').eq('company_id', companyId).eq('status', 'active'),
      supabaseClient.from('accounting_settings').select('account_map').eq('company_id', companyId).maybeSingle()
    ]);
    if (accountsResult.error) throw accountsResult.error;
    if (settingsResult.error) throw settingsResult.error;

    registry.clear();
    registerInTopologicalOrder(accountsResult.data || []);
    roleMap = (settingsResult.data && settingsResult.data.account_map) || {};
  }

  /**
   * @param {string} role a value from ACCOUNT_ROLES, or any future role string
   * @returns {string} the resolved accountId
   * @throws {AccountResolutionError} NOT_LOADED / ACCOUNT_NOT_CONFIGURED / ACCOUNT_NOT_FOUND / ACCOUNT_INACTIVE
   */
  function resolve (role) {
    if (roleMap === null) throw new AccountResolutionError(RESOLUTION_ERROR_CODES.NOT_LOADED, role);
    const accountId = roleMap[role];
    if (!accountId) throw new AccountResolutionError(RESOLUTION_ERROR_CODES.ACCOUNT_NOT_CONFIGURED, role);
    const account = registry.get(accountId);
    if (!account) throw new AccountResolutionError(RESOLUTION_ERROR_CODES.ACCOUNT_NOT_FOUND, role);
    if (account.status !== 'active') throw new AccountResolutionError(RESOLUTION_ERROR_CODES.ACCOUNT_INACTIVE, role);
    return account.id;
  }

  /**
   * @param {string[]} roles
   * @returns {Record<string, string>} role -> accountId
   */
  function resolveMany (roles) {
    const result = {};
    for (const role of roles) result[role] = resolve(role);
    return result;
  }

  /**
   * Same as resolve(), but returns null instead of throwing when a role has
   * no mapping at all -- for a provider's genuinely optional lines (e.g. no
   * cess on this sale, so INPUT_CESS_ACCOUNT need not be configured). Still
   * throws on ACCOUNT_NOT_FOUND/ACCOUNT_INACTIVE -- a configured-but-broken
   * mapping is a real error, not an absent optional one.
   */
  function resolveOptional (role) {
    if (roleMap === null) throw new AccountResolutionError(RESOLUTION_ERROR_CODES.NOT_LOADED, role);
    if (!roleMap[role]) return null;
    return resolve(role);
  }

  function isLoaded () {
    return roleMap !== null;
  }

  /**
   * Exposes the loaded chart of accounts for reuse by validateJournalEntry()'s
   * own accountRegistry collaborator (see posting/postingFacade.js) -- so a
   * post() call loads a company's accounts once, not twice.
   * @returns {ReturnType<typeof createAccountRegistry>}
   */
  function getAccountRegistry () {
    return registry;
  }

  return { load, resolve, resolveMany, resolveOptional, isLoaded, getAccountRegistry };
}
