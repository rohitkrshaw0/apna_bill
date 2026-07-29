// sales/salesDataLoader.js
// The ONLY file under businessIntelligence/sales/ that touches Supabase --
// same "one loader per domain, everything downstream is a pure function"
// rule inventory/inventoryDataLoader.js (12A) and
// purchase/purchaseDataLoader.js (12B) both already established, frozen,
// unmodified by this milestone. Runs exactly four company-scoped queries
// (a fifth, `batches`, is skipped if no line references a batch): `invoices`
// (bounded to lookbackDays via invoice_date, scoped to doc_type IN
// ('sale','sale_return') -- quotations are never real sales), `invoice_lines`
// (scoped to `.in('invoice_id', invoiceIds)`, never its own date filter),
// `parties` (customers only), and `batches` (cost_price only, scoped to the
// batch ids invoice_lines actually reference, for the gross margin calculator).
//
// Known, disclosed limitation: `invoices.doc_type` allows 'sale_return' by
// schema, but `create_sale` (sale_rpc.sql) always inserts doc_type='sale' --
// no workflow in this ERP ever writes a 'sale_return' row today (the same
// disclosed-gap pattern 11B's own report already established for
// PurchaseDeleted/SaleCancelled/ManufacturingStarted: registered, never
// wired). Return-rate metrics computed from this data will read as 0% in
// every real company today, and will become meaningful automatically, with
// no code change here, the moment a future milestone implements sale
// returns against the existing schema.
//
// Read-only: no insert/update/delete anywhere in this file, and no RPC call.
//
// Milestone 12D (Pricing Intelligence) addendum: `invoice_lines.discount_pct`/
// `discount_amt` were added to the existing `.select()` below -- both
// columns already existed in schema.sql, simply unread until now. Purely
// additive: no existing field, query, or return shape changed; zero new
// queries (avoids re-querying invoice_lines a second time just for two more
// columns, per this milestone's own "avoid repeated database queries"
// rule). See calculators/discountCalculator.js.

import { supa, getActiveCompanyId } from '../../../supabaseClient.js';
import { DEFAULT_LOOKBACK_DAYS } from '../shared/config.js';

function daysAgoIso (days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10); // invoices.invoice_date is a `date` column, not timestamptz
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
 * @typedef {object} SalesSnapshot
 * @property {string} companyId
 * @property {string} generatedAt ISO-8601
 * @property {number} lookbackDays
 * @property {string} cutoffDate the invoice_date cutoff (YYYY-MM-DD)
 * @property {object[]} invoices every sale/sale_return invoice within the window, company-scoped
 * @property {object[]} invoiceLines every invoice_line belonging to one of those invoices, enriched with invoiceDate/partyId/docType/batchCostPrice
 * @property {Map<string, object[]>} invoiceLinesByItem itemId -> enriched invoice_line rows
 * @property {Map<string, object[]>} invoicesByCustomer partyId -> invoice rows
 * @property {Map<string, object[]>} invoiceLinesByCustomer partyId -> enriched invoice_line rows
 * @property {object[]} customers every active customer (parties where is_customer), company-scoped
 */

/**
 * @param {object} [opts]
 * @param {string} [opts.companyId] defaults to getActiveCompanyId()
 * @param {number} [opts.lookbackDays] how far back invoices are scanned (default 365)
 * @returns {Promise<SalesSnapshot>}
 */
export async function loadSalesSnapshot ({ companyId, lookbackDays = DEFAULT_LOOKBACK_DAYS } = {}) {
  const co = companyId || getActiveCompanyId();
  if (!co) throw new Error('loadSalesSnapshot: no active company');

  const cutoffDate = daysAgoIso(lookbackDays);

  const [invoicesRes, customersRes] = await Promise.all([
    supa.from('invoices')
      .select('id, invoice_no, invoice_date, doc_type, party_id, subtotal, grand_total, amount_paid, amount_due, created_at')
      .eq('company_id', co)
      .in('doc_type', ['sale', 'sale_return'])
      .gte('invoice_date', cutoffDate),
    supa.from('parties')
      .select('id, name, is_active')
      .eq('company_id', co).eq('is_customer', true)
  ]);
  if (invoicesRes.error) throw invoicesRes.error;
  if (customersRes.error) throw customersRes.error;

  const invoices = (invoicesRes.data || []).map((i) => ({
    id: i.id,
    invoiceNo: i.invoice_no,
    invoiceDate: i.invoice_date,
    docType: i.doc_type,
    partyId: i.party_id,
    subtotal: +i.subtotal || 0,
    grandTotal: +i.grand_total || 0,
    amountPaid: +i.amount_paid || 0,
    amountDue: +i.amount_due || 0,
    createdAt: i.created_at
  }));

  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const invoiceIds = invoices.map((i) => i.id);

  let invoiceLines = [];
  if (invoiceIds.length) {
    const { data: lineRows, error: linesError } = await supa.from('invoice_lines')
      .select('invoice_id, item_id, item_name_snapshot, hsn_sac, batch_id, qty_paid, qty_free, rate, discount_pct, discount_amt, taxable_value, line_total')
      .in('invoice_id', invoiceIds);
    if (linesError) throw linesError;

    const batchIds = [...new Set(lineRows.map((l) => l.batch_id).filter(Boolean))];
    let costByBatchId = new Map();
    if (batchIds.length) {
      const { data: batchRows, error: batchError } = await supa.from('batches')
        .select('id, cost_price')
        .in('id', batchIds);
      if (batchError) throw batchError;
      costByBatchId = new Map((batchRows || []).map((b) => [b.id, +b.cost_price || 0]));
    }

    invoiceLines = lineRows.map((l) => {
      const invoice = invoiceById.get(l.invoice_id);
      return {
        invoiceId: l.invoice_id,
        itemId: l.item_id,
        itemName: l.item_name_snapshot,
        hsnSac: l.hsn_sac,
        batchId: l.batch_id,
        qty: +l.qty_paid || 0,
        qtyFree: +l.qty_free || 0,
        rate: +l.rate || 0,
        // Added in Milestone 12D (Pricing Intelligence) -- purely additive,
        // read but unused by any 12C consumer; see
        // calculators/discountCalculator.js.
        discountPct: +l.discount_pct || 0,
        discountAmt: +l.discount_amt || 0,
        taxableValue: +l.taxable_value || 0,
        lineTotal: +l.line_total || 0,
        invoiceDate: invoice ? invoice.invoiceDate : null,
        partyId: invoice ? invoice.partyId : null,
        docType: invoice ? invoice.docType : null,
        billDate: invoice ? invoice.invoiceDate : null, // alias -- see metrics/salesMetrics.js header comment for why
        batchCostPrice: l.batch_id ? (costByBatchId.get(l.batch_id) ?? null) : null
      };
    });
  }

  const customers = (customersRes.data || []).map((c) => ({
    id: c.id,
    name: c.name,
    isActive: !!c.is_active
  }));

  return {
    companyId: co,
    generatedAt: new Date().toISOString(),
    lookbackDays,
    cutoffDate,
    invoices,
    invoiceLines,
    invoiceLinesByItem: groupBy(invoiceLines, (l) => l.itemId),
    invoicesByCustomer: groupBy(invoices, (i) => i.partyId),
    invoiceLinesByCustomer: groupBy(invoiceLines, (l) => l.partyId),
    customers
  };
}
