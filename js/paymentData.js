// =====================================================================
// paymentData.js
// Data layer for payments.html (Milestone 15I — Payments & Receipts).
// Mirrors js/sales.js's/js/manualJournal.js's own split: this module owns
// the open-document reads and the one write path (record_payment() then
// AccountingPlatform.post(), the same two-step shape saveSaleFromCart()
// already uses) -- it never inserts into invoices/purchases/parties
// directly (record_payment() is the only write path for those, per
// ADR-0016), and never imports a posting provider, registry, or the
// account resolver directly. payments.html imports and calls its own
// registerReceiptPostingProvider()/registerPaymentPostingProvider(), the
// same place sale.html/purchase.html/journal.html each register their
// own posting provider -- not this data-layer module.
//
// Party search and payment-type listing are NOT duplicated here --
// js/sales.js already exports searchParties() (role-parameterised for
// both customer and supplier) and listPaymentTypes(), reused directly by
// payments.html. This file's own job is exactly the settlement domain:
// which documents are open for a given party, and recording a
// settlement against one of them.
// =====================================================================

import { supa, getActiveCompanyId } from './supabaseClient.js';
import { AccountingPlatform, VOUCHER_TYPES } from './services/accounting/index.js';

const OPEN_INVOICE_SELECT = 'id, invoice_no, invoice_date, grand_total, amount_paid, amount_due';
const OPEN_PURCHASE_SELECT = 'id, bill_no, bill_date, grand_total, amount_paid, amount_due';

// Same "genuinely new bounded read" cap this codebase already uses for a
// single party/document picker (not a paginated register) -- a party with
// more open documents than this is not a realistic case for a small
// business, and if it ever is, that is a Sales/Purchase Register job, not
// this screen's.
const OPEN_DOCS_LIMIT = 200;

/**
 * One party's current display fields, re-read after a settlement so the
 * screen can show the post-settlement balance without a page reload.
 * Not a duplicate of js/sales.js's own searchParties() (a text-search
 * lookup) -- this is a real, different need: "this exact party, by id."
 * @param {string} partyId
 * @returns {Promise<object|null>}
 */
export async function getPartyById (partyId) {
  if (!partyId) return null;
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('parties')
    .select('id, name, phone, gstin, current_balance')
    .eq('company_id', co).eq('id', partyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Every unpaid/partially-unpaid sale invoice for one customer, oldest
 * first (so the natural settlement order -- oldest debt first -- is the
 * default order the screen renders). Reads invoices.amount_due directly,
 * the same authoritative column js/salesRegisterData.js's own payment-
 * status filter already buckets -- never a new calculation.
 * @param {string} partyId
 * @returns {Promise<object[]>}
 */
export async function listOpenInvoicesForParty (partyId) {
  if (!partyId) return [];
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('invoices')
    .select(OPEN_INVOICE_SELECT)
    .eq('company_id', co).eq('party_id', partyId)
    .gt('amount_due', 0)
    .order('invoice_date', { ascending: true }).order('created_at', { ascending: true })
    .limit(OPEN_DOCS_LIMIT);
  if (error) throw error;
  return data || [];
}

/**
 * Every unpaid/partially-unpaid purchase bill for one supplier, oldest
 * first -- the mirror of listOpenInvoicesForParty(). Reads
 * purchases.amount_due directly, the same column
 * js/purchaseRegisterData.js's own payment-status filter already buckets.
 * @param {string} supplierId
 * @returns {Promise<object[]>}
 */
export async function listOpenPurchasesForParty (supplierId) {
  if (!supplierId) return [];
  const co = getActiveCompanyId();
  const { data, error } = await supa.from('purchases')
    .select(OPEN_PURCHASE_SELECT)
    .eq('company_id', co).eq('supplier_id', supplierId)
    .gt('amount_due', 0)
    .order('bill_date', { ascending: true }).order('created_at', { ascending: true })
    .limit(OPEN_DOCS_LIMIT);
  if (error) throw error;
  return data || [];
}

/**
 * Records one settlement against exactly one open document -- document-
 * level allocation only, per ADR-0016 Decision 2: one record_payment()
 * call settles one invoice (a receipt) or one purchase (a payment). The
 * RPC is the sole atomic writer of the payments row, the settled
 * document's amount_paid/amount_due, and the party's current_balance
 * (see accounting_rpc.sql's own header). Posting is a second, separate,
 * best-effort call after the settlement is already committed -- a
 * posting failure does NOT roll back or retry the settlement (there is
 * no unrecord_payment() to do that with); it is returned alongside the
 * settlement result for the caller to surface, exactly the accepted
 * failure semantics 15B's design review settled on for Sales/Purchase.
 * @param {object} params
 * @param {'receipt'|'payment'} params.direction
 * @param {string} params.partyId
 * @param {string|null} [params.invoiceId] required for a receipt
 * @param {string|null} [params.purchaseId] required for a payment
 * @param {number} params.amount rupees, > 0, must not exceed the document's own amount_due
 * @param {string} params.paymentDate 'YYYY-MM-DD'
 * @param {string|null} [params.paymentTypeId]
 * @param {string|null} [params.reference]
 * @param {string|null} [params.notes]
 * @param {string|null} [params.documentNo] the settled document's own invoice_no/bill_no, for the journal narration only
 * @returns {Promise<object>} the RPC result plus `posting` (AccountingPlatform.post()'s own result shape)
 */
export async function recordSettlement ({
  direction, partyId, invoiceId = null, purchaseId = null, amount,
  paymentDate, paymentTypeId = null, reference = null, notes = null, documentNo = null
}) {
  const co = getActiveCompanyId();
  if (!co) throw new Error('No active company');
  if (direction !== 'receipt' && direction !== 'payment') {
    throw new TypeError('recordSettlement: direction must be "receipt" or "payment"');
  }

  const payload = {
    company_id: co,
    direction,
    party_id: partyId,
    invoice_id: invoiceId,
    purchase_id: purchaseId,
    amount,
    payment_date: paymentDate,
    payment_type_id: paymentTypeId || null,
    reference: reference || null,
    notes: notes || null
  };

  const { data, error } = await supa.rpc('record_payment', { payload });
  if (error) throw error;

  // Milestone 15I: posting is a second, separate call after the
  // settlement is already committed -- see this function's own header.
  const posting = await AccountingPlatform.post({
    companyId: co,
    voucherType: direction === 'receipt' ? VOUCHER_TYPES.RECEIPT : VOUCHER_TYPES.PAYMENT,
    sourceData: {
      date: paymentDate,
      amount,
      documentNo,
      reference: reference || null
    },
    ref: { table: 'payments', id: data.payment_id },
    createdBy: null
  });

  return { ...data, posting };
}
