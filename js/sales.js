// =====================================================================
// sales.js (v4)
// Data layer for the Sale (billing) screen.
// Reads from company; writes an invoice against the active firm.
// =====================================================================

import { supa, getActiveCompanyId, getActiveFirmId } from './supabaseClient.js';
import { buildInvoiceMath, isInterstate as calcInterstate } from './gst.js';
import { createSearchService } from './searchService.js';
import { eventBus, EVENT_TYPES } from './services/events/index.js';
import { AccountingPlatform, VOUCHER_TYPES } from './services/accounting/index.js';

// Milestone 15B production-readiness review: this data layer calls only
// AccountingPlatform.post() below -- it never imports a posting provider,
// registry, or the account resolver directly. Registering the Sales
// posting provider is the screen's job (sale.html imports
// registerSalesPostingProvider() itself), the same place reports.html
// already calls every registerXReport() for the Reporting Platform,
// rather than a business data-layer module reaching into providers/.

// ---------- CATALOG ---------------------------------------------------
const itemSearch = createSearchService({
  table: 'items',
  select: 'id, name, code, kind, hsn_sac, unit, gst_rate, cess_rate, is_price_inclusive, default_retail_price, default_wholesale_price, track_stock, track_batches',
  searchColumns: ['name', 'code'],
  scope: { is_active: true }
});
export function searchItems (q, { limit } = {}) {
  return itemSearch(q, { limit });
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

const partySearch = createSearchService({
  table: 'parties',
  select: 'id, name, phone, gstin, state_code, address, current_balance, loyalty_points',
  searchColumns: ['name', 'phone'],
  scope: { is_active: true }
});
export function searchParties (q, { role = 'customer', limit } = {}) {
  return partySearch(q, { limit, scope: { [role === 'supplier' ? 'is_supplier' : 'is_customer']: true } });
}

export async function createPartyQuick ({ name, phone, gstin, state_code, address }) {
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('parties').insert({
    company_id: co,
    name, phone, gstin, state_code, address,
    is_customer: true, is_supplier: false
  }).select('*').single();
  if (error) throw error;
  // Milestone 11B: this function is also the shared party writer both the
  // XML and JSON importers call for a sale's customer -- one publish site
  // here covers manual UI creation and both import formats.
  eventBus.publish(EVENT_TYPES.CUSTOMER_CREATED, { aggregateId: data.id, payload: { name: data.name }, context: { company: co, module: 'sales' } });
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
  // Milestone 11B: also the shared sale writer both the XML and JSON
  // importers call -- see createPartyQuick's own note above for why one
  // publish site here is correct rather than duplicated per caller.
  eventBus.publish(EVENT_TYPES.SALE_CREATED, { aggregateId: data.invoice_id, payload: { invoiceNo: data.invoice_no, partyId: cart.party?.id || null }, context: { company: co, module: 'sales' } });

  // Milestone 15B: posting is a second, separate call after the sale is
  // already committed -- there is no single DB transaction spanning both
  // (create_sale is its own RPC). A posting failure does NOT roll back or
  // retry the sale (no cancel_sale RPC exists to do that with); it is
  // returned alongside the sale result so the caller can surface it,
  // exactly the accepted failure semantics the Milestone 15B design
  // review settled on.
  const posting = await AccountingPlatform.post({
    companyId: co,
    voucherType: VOUCHER_TYPES.SALES,
    sourceData: {
      date: cart.invoice_date || new Date().toISOString().slice(0, 10),
      invoiceNo: data.invoice_no,
      totals: built.totals,
      roundOff: built.round_off,
      amountPaid: Math.min(+cart.payment?.amount || 0, built.totals.grand_total)
    },
    ref: { table: 'invoices', id: data.invoice_id },
    createdBy: null
  });

  return { ...data, totals: built.totals, posting };
}
