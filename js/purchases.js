// =====================================================================
// purchases.js (v4)
// =====================================================================

import { supa, getActiveCompanyId, getActiveFirmId } from './supabaseClient.js';
import { buildInvoiceMath, isInterstate as calcInterstate } from './gst.js';

// Supplier search/create now live in suppliers.js (shared with the
// Supplier Management screen) — re-exported here so purchase.html's
// existing import from './js/purchases.js' doesn't need to change.
export { searchSuppliers, createSupplierQuick } from './suppliers.js';

export function buildPurchase ({ sellerStateCode, supplier, lines, roundOff = 'nearest' }) {
  const mapped = lines.map(l => ({ ...l, qty_paid: +l.qty || 0, qty_free: +l.qty_free || 0 }));
  const supplierState = supplier?.state_code || null;
  const interstate = calcInterstate(sellerStateCode, supplierState);
  const math = buildInvoiceMath(mapped, { isInterstate: interstate, roundOff });
  math.lines = math.lines.map(l => {
    const { qty_paid, ...rest } = l;
    return { ...rest, qty: qty_paid };
  });
  return { ...math, is_interstate: interstate };
}

export async function savePurchaseFromCart (cart) {
  const co = getActiveCompanyId();
  const fm = getActiveFirmId();
  if (!co) throw new Error('No active company');
  if (!fm) throw new Error('No active firm — pick one from the top bar');

  const built = buildPurchase({
    sellerStateCode: cart.seller_state_code,
    supplier:        cart.supplier,
    lines:           cart.lines,
    roundOff:        cart.round_off_mode || 'nearest'
  });

  const payload = {
    company_id: co,
    firm_id:    fm,
    bill_no:    cart.bill_no,
    bill_date:  cart.bill_date || null,
    supplier_id: cart.supplier?.id || null,
    supplier_snapshot: cart.supplier ? {
      gstin:      cart.supplier.gstin || null,
      state_code: cart.supplier.state_code || null
    } : null,
    is_interstate: built.is_interstate,
    notes:         cart.notes || null,
    round_off:     built.round_off,
    totals:        built.totals,
    lines:         built.lines,
    payment:       cart.payment || null
  };

  const { data, error } = await supa.rpc('create_purchase', { payload });
  if (error) throw error;
  return { ...data, totals: built.totals };
}
