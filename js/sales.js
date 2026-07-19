// =====================================================================
// sales.js (v4)
// Data layer for the Sale (billing) screen.
// Reads from company; writes an invoice against the active firm.
// =====================================================================

import { supa, getActiveCompanyId, getActiveFirmId } from './supabaseClient.js';
import { buildInvoiceMath, isInterstate as calcInterstate } from './gst.js';

// ---------- CATALOG ---------------------------------------------------
export async function searchItems (q, { limit = 20 } = {}) {
  const co = getActiveCompanyId();
  const term = (q || '').trim();
  let query = supa.from('items')
    .select('id, name, code, kind, hsn_sac, unit, gst_rate, cess_rate, is_price_inclusive, default_retail_price, default_wholesale_price, track_stock, track_batches')
    .eq('company_id', co).eq('is_active', true).limit(limit);
  if (term) query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function listBatches (itemId, { includeEmpty = false } = {}) {
  const co = getActiveCompanyId();
  let q = supa.from('batches')
    .select('id, batch_no, shade, size, mrp, cost_price, retail_price, wholesale_price, qty_on_hand, created_at')
    .eq('company_id', co).eq('item_id', itemId)
    .order('created_at', { ascending: false });
  if (!includeEmpty) q = q.gt('qty_on_hand', 0);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function searchParties (q, { role = 'customer', limit = 20 } = {}) {
  const co = getActiveCompanyId();
  const term = (q || '').trim();
  let query = supa.from('parties')
    .select('id, name, phone, gstin, state_code, address, current_balance, loyalty_points')
    .eq('company_id', co).eq('is_active', true).limit(limit);
  if (role === 'customer') query = query.eq('is_customer', true);
  if (role === 'supplier') query = query.eq('is_supplier', true);
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createPartyQuick ({ name, phone, gstin, state_code, address }) {
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('parties').insert({
    company_id: co,
    name, phone, gstin, state_code, address,
    is_customer: true, is_supplier: false
  }).select('*').single();
  if (error) throw error;
  return data;
}

// ---------- PAYMENT TYPES --------------------------------------------
export async function listPaymentTypes () {
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('payment_types')
    .select('id, name, sort_order')
    .eq('company_id', co).eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ---------- LOYALTY --------------------------------------------------
export async function getLoyaltyConfig () {
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('companies')
    .select('loyalty_enabled, loyalty_earn_per_100, loyalty_redeem_value, loyalty_min_redeem_points')
    .eq('id', co).maybeSingle();
  if (error) throw error;
  return data;
}
export async function getPartyLoyalty (partyId) {
  const { data, error } = await supa.from('parties')
    .select('loyalty_points, name').eq('id', partyId).maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- INVOICE MATH ---------------------------------------------
export function buildSale ({ sellerStateCode, party, lines, roundOff = 'nearest' }) {
  const buyerState = party?.state_code || null;
  const interstate = calcInterstate(sellerStateCode, buyerState);
  const math = buildInvoiceMath(lines, { isInterstate: interstate, roundOff });
  return { ...math, is_interstate: interstate };
}

// ---------- SAVE VIA RPC ---------------------------------------------
export async function saveSaleFromCart (cart) {
  const co = getActiveCompanyId();
  const fm = getActiveFirmId();
  if (!co) throw new Error('No active company');
  if (!fm) throw new Error('No active firm — pick one from the top bar');

  const built = buildSale({
    sellerStateCode: cart.seller_state_code,
    party:           cart.party,
    lines:           cart.lines,
    roundOff:        cart.round_off_mode || 'nearest'
  });

  const payload = {
    company_id:   co,
    firm_id:      fm,
    invoice_date: cart.invoice_date || null,
    is_interstate: built.is_interstate,
    party_id:     cart.party?.id || null,
    party_snapshot: cart.party ? {
      name:       cart.party.name || '',
      phone:      cart.party.phone || null,
      gstin:      cart.party.gstin || null,
      state_code: cart.party.state_code || null
    } : null,
    notes:                 cart.notes || null,
    loyalty_redeem_points: +cart.loyalty_redeem_points || 0,
    loyalty_discount:      +cart.loyalty_discount || 0,
    round_off:             built.round_off,
    totals:                built.totals,
    lines:                 built.lines,
    payment:               cart.payment || null
  };

  const { data, error } = await supa.rpc('create_sale', { payload });
  if (error) throw error;
  return { ...data, totals: built.totals };
}
