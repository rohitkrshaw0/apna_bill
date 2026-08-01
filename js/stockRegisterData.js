// =====================================================================
// stockRegisterData.js
// Reporting Data Access layer for the Stock Register (Milestone 14B.4A),
// per ADR-0004 (Reporting Data Access Strategy) and ADR-0005 (Operational
// Report Data Provider Pattern). One provider, one report/domain, flat
// and top-level, sibling to items.js/purchaseRegisterData.js/
// salesRegisterData.js -- never nested inside js/services/reporting/.
//
// Real need this closes: `js/items.js` already has
// getStockLedgerForBatch(batchId)/getStockLedgerForItem(itemId) -- both
// single-item/single-batch drill-down reads for the Stock screen's own
// history view, neither company-wide. Business Intelligence's own
// inventoryIntelligence (js/services/businessIntelligence/api/
// inventoryIntelligenceApi.js) exposes only aggregate/insight shapes --
// low stock, out of stock, dead/slow/fast-moving, overstock, category and
// reorder summaries, an inventory value model -- never a row-level
// transaction listing. A Stock Register needs a dated, filtered,
// paginated, company-wide listing of every stock_ledger row -- the exact
// gap ADR-0004 exists to close. Nothing here imports
// businessIntelligence/, and nothing here writes.
//
// No stock calculation is duplicated: qty_in/qty_out/unit_cost are read
// exactly as record_stock_adjustment's own RPC (and every other write
// path into stock_ledger -- create_sale, create_purchase, manufacturing
// RPCs) already wrote them. This provider never computes a running
// balance -- batches.qty_on_hand is the one authoritative *current*
// balance items.js/stock.html already read; a historical running balance
// would be a real, new calculation over an ordered cumulative sum, not a
// read-only listing, and is deliberately not built here.
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';

export const STOCK_REGISTER_SORT = Object.freeze({
  DATE_DESC: 'dateDesc',
  DATE_ASC: 'dateAsc',
  QTY_IN_DESC: 'qtyInDesc',
  QTY_OUT_DESC: 'qtyOutDesc'
});

// Mirrors stock_ledger.txn_type's own check constraint (schema.sql).
export const STOCK_REGISTER_TXN_TYPES = Object.freeze([
  { value: 'purchase', label: 'Purchase' },
  { value: 'sale', label: 'Sale' },
  { value: 'sale_return', label: 'Sale Return' },
  { value: 'purchase_return', label: 'Purchase Return' },
  { value: 'mfg_consume', label: 'Manufacturing Consume' },
  { value: 'mfg_produce', label: 'Manufacturing Produce' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'opening', label: 'Opening' }
]);

// item_id/batch_id -> items(name, unit)/batches(batch_no) via the
// existing foreign keys -- the same embedding style
// dataExchange/xml/export/dataReaders.js already uses
// (`invoice_lines.select('*, batches(batch_no)')`) and
// purchaseRegisterData.js already reuses (`parties(name, phone)`), used
// here for DISPLAY only. Search/sort deliberately stay on stock_ledger's
// own base-table columns, the same precedent-safety reasoning
// purchaseRegisterData.js's own header comment documents.
const SELECT = 'id, item_id, batch_id, txn_date, txn_type, qty_in, qty_out, unit_cost, notes, items(name, unit), batches(batch_no)';

// Same looped-read page size dataReaders.js/salesRegisterData.js/
// purchaseRegisterData.js all already use.
const PAGE_SIZE_MAX = 500;

function applyFilters (query, { dateFrom, dateTo, itemId, txnType, search } = {}) {
  // txn_date is timestamptz (unlike invoice_date/bill_date's plain
  // date) -- the "to" boundary must reach the end of that calendar day,
  // not its midnight start, or the last day of a range would be dropped.
  if (dateFrom) query = query.gte('txn_date', dateFrom);
  if (dateTo) query = query.lte('txn_date', `${dateTo}T23:59:59.999`);
  if (itemId) query = query.eq('item_id', itemId);
  if (txnType) query = query.eq('txn_type', txnType);

  const term = (search || '').trim();
  if (term) query = query.ilike('notes', `%${term}%`);

  return query;
}

function applySort (query, sort) {
  switch (sort) {
    case STOCK_REGISTER_SORT.DATE_ASC: return query.order('txn_date', { ascending: true });
    case STOCK_REGISTER_SORT.QTY_IN_DESC: return query.order('qty_in', { ascending: false });
    case STOCK_REGISTER_SORT.QTY_OUT_DESC: return query.order('qty_out', { ascending: false });
    default: return query.order('txn_date', { ascending: false });
  }
}

/**
 * A dated, filtered, paginated, sortable listing of stock movements -- the
 * Stock Register's own real row-level need (ADR-0004 path 2). Company-
 * scoped and RLS-bound exactly like every other js/*.js read.
 * @param {object} opts
 * @param {string|null} [opts.dateFrom] "YYYY-MM-DD", inclusive
 * @param {string|null} [opts.dateTo] "YYYY-MM-DD", inclusive
 * @param {string} [opts.itemId]
 * @param {string} [opts.txnType] one of STOCK_REGISTER_TXN_TYPES' values
 * @param {string} [opts.search] matched against notes
 * @param {string} [opts.sort] one of STOCK_REGISTER_SORT
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @returns {Promise<{rows: object[], count: number}>}
 */
export async function listStockRegisterRows ({
  dateFrom = null, dateTo = null, itemId = '', txnType = '', search = '',
  sort = STOCK_REGISTER_SORT.DATE_DESC, limit = 40, offset = 0
} = {}) {
  const co = getActiveCompanyId();
  let query = supa.from('stock_ledger').select(SELECT, { count: 'exact' }).eq('company_id', co);
  query = applyFilters(query, { dateFrom, dateTo, itemId, txnType, search });
  query = applySort(query, sort);
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

/**
 * Every row matching the current filters, ignoring pagination -- backs
 * the Stock Register's own CSV export. Loops in PAGE_SIZE_MAX batches,
 * the same fetchAllPages convention this codebase already uses.
 * @param {object} filters same shape as listStockRegisterRows, minus limit/offset
 * @returns {Promise<object[]>}
 */
export async function listAllStockRegisterRows (filters = {}) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { rows: page } = await listStockRegisterRows({ ...filters, limit: PAGE_SIZE_MAX, offset });
    rows.push(...page);
    if (page.length < PAGE_SIZE_MAX) break;
    offset += PAGE_SIZE_MAX;
  }
  return rows;
}
