// =====================================================================
// suppliers.js
// Data layer for the Supplier Management screen. Company-scoped.
// Suppliers live in the shared `parties` table (is_supplier = true) —
// same table customers will use, same pattern as items.js.
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';
import { createSearchService } from './searchService.js';

const SUPPLIER_SELECT = 'id, name, phone, gstin, state_code, address, current_balance, is_active';

// Used by the purchase-screen supplier picker (quick, unpaginated lookup).
const supplierSearch = createSearchService({
  table: 'parties',
  select: SUPPLIER_SELECT,
  searchColumns: ['name', 'phone'],
  scope: { is_active: true, is_supplier: true }
});
export function searchSuppliers (q, { limit } = {}) {
  return supplierSearch(q, { limit });
}

/**
 * List suppliers with search + pagination, for the Supplier Management screen.
 * @param {object} opts { q, limit, offset, activeOnly, sort: 'name' | 'balance' }
 */
export async function listSuppliers ({ q = '', limit = 40, offset = 0, activeOnly = true, sort = 'name' } = {}) {
  const co = getActiveCompanyId();
  let query = supa.from('parties').select(SUPPLIER_SELECT, { count: 'exact' })
    .eq('company_id', co).eq('is_supplier', true);
  if (activeOnly) query = query.eq('is_active', true);
  const term = q.trim();
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,gstin.ilike.%${term}%`);
  query = sort === 'balance'
    ? query.order('current_balance', { ascending: true })
    : query.order('name', { ascending: true });
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { suppliers: data || [], count: count || 0 };
}

export async function getSupplier (id) {
  const { data, error } = await supa.from('parties').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Purchase Count + Last Purchase Date, computed on demand for the details view. */
export async function getSupplierPurchaseStats (id) {
  const co = getActiveCompanyId();
  const [{ count, error: countErr }, { data: latest, error: latestErr }] = await Promise.all([
    supa.from('purchases').select('id', { count: 'exact' })
      .eq('company_id', co).eq('supplier_id', id),
    supa.from('purchases').select('bill_date')
      .eq('company_id', co).eq('supplier_id', id)
      .order('bill_date', { ascending: false }).limit(1).maybeSingle()
  ]);
  if (countErr) throw countErr;
  if (latestErr) throw latestErr;
  return { purchaseCount: count || 0, lastPurchaseDate: latest?.bill_date || null };
}

export async function createSupplier ({ name, phone, gstin, state_code, address }) {
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('parties').insert({
    company_id: co,
    name, phone, gstin, state_code, address,
    is_customer: false, is_supplier: true
  }).select('*').single();
  if (error) throw error;
  return data;
}
// Alias kept for purchase.html's quick "Add new" supplier dialog — same
// insert, just named after where it's called from (mirrors createSupplier).
export { createSupplier as createSupplierQuick };

export async function updateSupplier (id, { name, phone, gstin, state_code, address }) {
  const { data, error } = await supa.from('parties')
    .update({ name, phone, gstin, state_code, address })
    .eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function setSupplierActive (id, isActive) {
  const { error } = await supa.from('parties').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}
