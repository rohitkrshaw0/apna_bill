// xml/export/mapping/vouchers/salesVoucherExportMapper.js
// ERP-agnostic: invoice + invoice_lines rows -> saleDTO. No Tally tag names,
// no VOUCHER/LEDGERENTRIES.LIST/ALLINVENTORYENTRIES.LIST structure, no
// "Cash Sale" literal -- that string is Tally's own walk-in-sale convention
// and is tallyXmlFormatterV1.js's decision to make when it sees
// customerId === null. This mapper only ever emits a plain uuid|null.
//
// totals/lines are TRANSCRIBED from the invoice's already-committed,
// authoritative values -- never recomputed. That GST/discount/round-off
// math already ran once, at sale time, via buildInvoiceMath() (js/gst.js,
// called from js/sales.js's buildSale()); re-deriving it here would be
// exactly the business-logic duplication the spec forbids.

import { createSaleDTO } from '../../../../dto/saleDTO.js';

/**
 * @param {object} invoice a row from `invoices`
 * @param {object[]} lines rows from `invoice_lines`, ordered by line_no
 */
export function mapInvoiceToSaleDTO (invoice, lines) {
  const dto = createSaleDTO({
    id: invoice.id,
    invoiceNo: invoice.invoice_no,
    invoiceDate: invoice.invoice_date,
    customerId: invoice.party_id || null,
    lines: lines.map(l => ({
      item_id: l.item_id || null,
      item_name: l.item_name_snapshot,
      hsn_sac: l.hsn_sac || null,
      unit: l.unit || null,
      qty_paid: Number(l.qty_paid) || 0,
      qty_free: Number(l.qty_free) || 0,
      rate: Number(l.rate) || 0,
      is_inclusive: !!l.is_inclusive,
      discount_pct: Number(l.discount_pct) || 0,
      discount_amt: Number(l.discount_amt) || 0,
      taxable_value: Number(l.taxable_value) || 0,
      gst_rate: Number(l.gst_rate) || 0,
      cgst_amt: Number(l.cgst_amt) || 0,
      sgst_amt: Number(l.sgst_amt) || 0,
      igst_amt: Number(l.igst_amt) || 0,
      cess_rate: Number(l.cess_rate) || 0,
      cess_amt: Number(l.cess_amt) || 0,
      line_total: Number(l.line_total) || 0,
      batch_id: l.batch_id || null,
      // batchNo travels only for XML fidelity (BATCHALLOCATIONS.LIST on
      // export) -- populated by dataReaders.js via a nested `batches(batch_no)`
      // select; 9B's importer never requires it to resolve a sale line.
      batchNo: l.batches?.batch_no || null
    })),
    totals: {
      subtotal: Number(invoice.subtotal) || 0,
      discount_total: Number(invoice.discount_total) || 0,
      cgst_total: Number(invoice.cgst_total) || 0,
      sgst_total: Number(invoice.sgst_total) || 0,
      igst_total: Number(invoice.igst_total) || 0,
      cess_total: Number(invoice.cess_total) || 0,
      round_off: Number(invoice.round_off) || 0,
      grand_total: Number(invoice.grand_total) || 0
    },
    // ApnaBill's payments are a separate table with a 1-to-many relationship
    // to an invoice (partial payments over time) -- there's no single
    // "the" payment to place on a saleDTO without inventing a lossy
    // simplification, so this stays null; amountPaid/amountDue (already a
    // clean per-invoice aggregate) travel in meta instead.
    payment: null,
    meta: {
      source: 'apnabill',
      isInterstate: !!invoice.is_interstate,
      partyName: invoice.party_name_snapshot || null,
      partyStateCode: invoice.party_state_code_snapshot || null,
      amountPaid: Number(invoice.amount_paid) || 0,
      amountDue: Number(invoice.amount_due) || 0
    }
  });

  return { dto };
}
