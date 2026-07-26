// purchase/purchaseDataLoader.js
// The ONLY file under businessIntelligence/purchase/ that touches Supabase --
// the same "one loader per domain, everything downstream is a pure function"
// rule inventory/inventoryDataLoader.js already established in Milestone 12A
// (frozen, unmodified by this milestone). Runs exactly three company-scoped
// queries no matter how many Purchase Intelligence getX() functions are
// later called: `purchases` (bounded to lookbackDays via bill_date, which
// already carries a real date column -- unlike stock_ledger, no separate
// "aggregate stock" workaround is needed here), `purchase_lines` (scoped to
// only the purchase ids the first query returned, never a separate date
// filter of its own since purchase_lines has no date column), and `parties`
// (suppliers only, company-scoped, for name lookups).
//
// purchase_lines carries no date -- this loader attaches each line's own
// purchase's billDate/supplierId onto it via an in-memory Map lookup (zero
// extra queries), which is what makes Purchase Trend / Price History /
// Rolling Purchase Average possible at all (12A's own invoice_lines reuse
// deliberately skipped this join and stayed lifetime-only -- Purchase
// Intelligence's brief explicitly requires dated history, so this loader
// does the join client-side instead, still "one query per table").
//
// Read-only: no insert/update/delete anywhere in this file, and no RPC call
// -- Purchase Intelligence never writes to purchases, suppliers, or
// inventory, per this milestone's own "absolute rules".

import { supa, getActiveCompanyId } from '../../../supabaseClient.js';
import { DEFAULT_LOOKBACK_DAYS } from '../shared/config.js';

function daysAgoIso (days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10); // purchases.bill_date is a `date` column, not timestamptz
}

function groupBy (rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key === null || key === undefined) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/**
 * @typedef {object} PurchaseSnapshot
 * @property {string} companyId
 * @property {string} generatedAt ISO-8601, when this snapshot was loaded
 * @property {number} lookbackDays
 * @property {string} cutoffDate the bill_date cutoff (YYYY-MM-DD) -- purchases older than this were not loaded
 * @property {object[]} purchases every purchase (bill) within the window, company-scoped
 * @property {object[]} purchaseLines every purchase_line belonging to one of those purchases, enriched with billDate/supplierId
 * @property {Map<string, object[]>} purchaseLinesByItem itemId -> enriched purchase_line rows
 * @property {Map<string, object[]>} purchasesBySupplier supplierId -> purchase rows
 * @property {object[]} suppliers every active supplier (parties where is_supplier), company-scoped
 */

/**
 * Loads every table Purchase Intelligence needs for one company, in exactly
 * three queries (a fourth only if the first query returns zero purchases,
 * in which case the second is skipped entirely), and shapes them into a
 * plain, pure-function-friendly snapshot. Never mutates ERP data.
 *
 * @param {object} [opts]
 * @param {string} [opts.companyId] defaults to getActiveCompanyId()
 * @param {number} [opts.lookbackDays] how far back purchases are scanned (default 365)
 * @returns {Promise<PurchaseSnapshot>}
 */
export async function loadPurchaseSnapshot ({ companyId, lookbackDays = DEFAULT_LOOKBACK_DAYS } = {}) {
  const co = companyId || getActiveCompanyId();
  if (!co) throw new Error('loadPurchaseSnapshot: no active company');

  const cutoffDate = daysAgoIso(lookbackDays);

  const [purchasesRes, suppliersRes] = await Promise.all([
    supa.from('purchases')
      .select('id, bill_no, bill_date, supplier_id, subtotal, grand_total, amount_paid, amount_due, created_at')
      .eq('company_id', co)
      .gte('bill_date', cutoffDate),
    supa.from('parties')
      .select('id, name, is_active')
      .eq('company_id', co).eq('is_supplier', true)
  ]);
  if (purchasesRes.error) throw purchasesRes.error;
  if (suppliersRes.error) throw suppliersRes.error;

  const purchases = (purchasesRes.data || []).map((p) => ({
    id: p.id,
    billNo: p.bill_no,
    billDate: p.bill_date,
    supplierId: p.supplier_id,
    subtotal: +p.subtotal || 0,
    grandTotal: +p.grand_total || 0,
    amountPaid: +p.amount_paid || 0,
    amountDue: +p.amount_due || 0,
    createdAt: p.created_at
  }));

  const purchaseById = new Map(purchases.map((p) => [p.id, p]));
  const purchaseIds = purchases.map((p) => p.id);

  let purchaseLines = [];
  if (purchaseIds.length) {
    const { data: lineRows, error: linesError } = await supa.from('purchase_lines')
      .select('purchase_id, item_id, item_name_snapshot, hsn_sac, qty, rate, taxable_value, line_total')
      .in('purchase_id', purchaseIds);
    if (linesError) throw linesError;
    purchaseLines = (lineRows || []).map((l) => {
      const purchase = purchaseById.get(l.purchase_id);
      return {
        purchaseId: l.purchase_id,
        itemId: l.item_id,
        itemName: l.item_name_snapshot,
        hsnSac: l.hsn_sac,
        qty: +l.qty || 0,
        rate: +l.rate || 0,
        taxableValue: +l.taxable_value || 0,
        lineTotal: +l.line_total || 0,
        billDate: purchase ? purchase.billDate : null,
        supplierId: purchase ? purchase.supplierId : null
      };
    });
  }

  const suppliers = (suppliersRes.data || []).map((s) => ({
    id: s.id,
    name: s.name,
    isActive: !!s.is_active
  }));

  return {
    companyId: co,
    generatedAt: new Date().toISOString(),
    lookbackDays,
    cutoffDate,
    purchases,
    purchaseLines,
    purchaseLinesByItem: groupBy(purchaseLines, (l) => l.itemId),
    purchasesBySupplier: groupBy(purchases, (p) => p.supplierId),
    suppliers
  };
}
