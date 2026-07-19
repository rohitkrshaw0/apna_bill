// =====================================================================
// items.js
// Data layer for the Items (catalog) screen. Company-scoped.
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';

/**
 * List items with search + aggregated stock (sum of batch qty_on_hand).
 * @param {object} opts { q, limit, offset, activeOnly }
 */
export async function listItemsWithStock ({ q = '', limit = 50, offset = 0, activeOnly = true } = {}) {
  const co = getActiveCompanyId();
  let query = supa.from('items').select('*', { count: 'exact' }).eq('company_id', co);
  if (activeOnly) query = query.eq('is_active', true);
  const term = q.trim();
  if (term) query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
  query = query.order('name', { ascending: true }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  const items = data || [];

  const ids = items.map(i => i.id);
  const stockMap = {};
  if (ids.length) {
    const { data: batches, error: e2 } = await supa
      .from('batches').select('item_id, qty_on_hand')
      .eq('company_id', co).in('item_id', ids);
    if (e2) throw e2;
    for (const b of (batches || [])) {
      stockMap[b.item_id] = (stockMap[b.item_id] || 0) + (+b.qty_on_hand || 0);
    }
  }

  return {
    items: items.map(i => ({ ...i, stock_qty: stockMap[i.id] || 0 })),
    count: count || 0
  };
}

export async function getItem (id) {
  const { data, error } = await supa.from('items').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createItem (payload) {
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('items')
    .insert({ company_id: co, ...payload })
    .select('*').single();
  if (error) throw error;
  return data;
}

export async function updateItem (id, payload) {
  const { data, error } = await supa.from('items')
    .update(payload).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function setItemActive (id, isActive) {
  const { error } = await supa.from('items').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

/**
 * Hard delete — will fail (FK restrict) if the item has batches, invoice
 * lines, or purchase lines referencing it. Caller should catch and
 * suggest "Deactivate" instead in that case.
 */
export async function deleteItemHard (id) {
  const { error } = await supa.from('items').delete().eq('id', id);
  if (error) throw error;
}

// ---------- STOCK / BATCHES -------------------------------------------

/** All batches for an item, newest first — includes empty (qty_on_hand = 0) batches. */
export async function listBatchesForItem (itemId) {
  const { data, error } = await supa.from('batches')
    .select('id, batch_no, shade, size, mrp, cost_price, retail_price, wholesale_price, qty_on_hand, created_at')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Stock ledger history for one batch (audit trail). */
export async function getStockLedgerForBatch (batchId, { limit = 50 } = {}) {
  const { data, error } = await supa.from('stock_ledger')
    .select('id, txn_type, ref_table, ref_id, qty_in, qty_out, unit_cost, notes, txn_date')
    .eq('batch_id', batchId)
    .order('txn_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/** Stock ledger history for a non-batch-tracked item (aggregate stock, batch_id is null). */
export async function getStockLedgerForItem (itemId, { limit = 50 } = {}) {
  const { data, error } = await supa.from('stock_ledger')
    .select('id, txn_type, ref_table, ref_id, qty_in, qty_out, unit_cost, notes, txn_date')
    .eq('item_id', itemId).is('batch_id', null)
    .order('txn_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/**
 * Record a manual stock correction (atomic RPC — locks the batch row,
 * updates qty_on_hand, and logs to stock_ledger + audit_log in one
 * transaction).
 */
export async function recordStockAdjustment ({ item_id, batch_id, adjustment_qty, reason, notes }) {
  const co = getActiveCompanyId();
  const payload = {
    company_id: co,
    item_id,
    batch_id: batch_id || null,
    adjustment_qty: +adjustment_qty || 0,
    reason,
    notes: notes || null
  };
  const { data, error } = await supa.rpc('record_stock_adjustment', { payload });
  if (error) throw error;
  return data;
}
