// A single, reusable "search this company-scoped table by a few text columns"
// engine. Every domain module (items, parties, and any future entity —
// invoices, expenses, etc.) configures one of these instead of hand-writing
// the same ilike-OR-limit query. Upgrading the matching itself later (an
// exact barcode/SKU lookup, fuzzy/trigram search, phonetic search) means
// changing the query-building step here once, not in every module that
// searches something.
import { supa, getActiveCompanyId } from './supabaseClient.js';

export function createSearchService ({ table, select, searchColumns = [], scope = {}, limit: defaultLimit = 20 }) {
  return async function search (q, opts = {}) {
    const co = getActiveCompanyId();
    const term = (q || '').trim();
    const limit = opts.limit ?? defaultLimit;
    const mergedScope = { ...scope, ...(opts.scope || {}) };

    let query = supa.from(table).select(select).eq('company_id', co).limit(limit);
    for (const [column, value] of Object.entries(mergedScope)) query = query.eq(column, value);
    if (term && searchColumns.length) {
      query = query.or(searchColumns.map(c => `${c}.ilike.%${term}%`).join(','));
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  };
}
