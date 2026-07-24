// xml/mapping/vouchers/salesVoucherMapper.js
// <VOUCHER VCHTYPE="Sales"> -> saleDTO. See docs/milestone-9b-xml-mapping.md
// section 3.6. Reuses js/sales.js's buildSale()/saveSaleFromCart() for all
// GST math and invoice numbering -- this mapper only shapes the cart-like
// `lines[]`, it never computes tax itself.

import { createSaleDTO } from '../../../dto/saleDTO.js';
import { splitNumberSpaceUnit, splitNumberSlashUnit, parseTrimmedNumber, parseTallyDate } from '../parseHelpers.js';
import { CASH_SALE_LITERAL } from '../masters/partyMapper.js';

// Sentinel prefix a customerId can carry when the party is a customer being
// imported in this same batch (no real DB id exists yet at mapping time) --
// resolved to a real id by xmlImporter.js after that customer's write step.
export const BY_NAME_PREFIX = '@byName:';

function listOf (value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function sumLedgerEntries (record) {
  let sum = 0;
  for (const entry of listOf(record['LEDGERENTRIES.LIST'])) {
    if (entry.AMOUNT != null) sum += parseTrimmedNumber(entry.AMOUNT);
  }
  return sum;
}

/**
 * @param {object} record a raw VOUCHER record (VCHTYPE="Sales") from tallyXmlParser
 * @param {object} ctx { resolveCustomerId(name): string|null }
 * @returns {{ dto: object, warnings: object[] }}
 */
export function mapSalesVoucherRecord (record, { resolveCustomerId } = {}) {
  const warnings = [];
  const invoiceNo = record.VOUCHERNUMBER != null ? String(record.VOUCHERNUMBER).trim() : null;
  const invoiceDate = parseTallyDate(record.DATE);
  if (record.DATE != null && invoiceDate == null) {
    warnings.push({ message: `Sales voucher ${invoiceNo || '?'}: DATE "${record.DATE}" is not YYYYMMDD`, field: 'invoiceDate' });
  }

  const partyLedgerName = record.PARTYLEDGERNAME || null;
  let customerId = null;
  if (partyLedgerName && partyLedgerName.trim() !== CASH_SALE_LITERAL) {
    const trimmedName = partyLedgerName.trim();
    customerId = resolveCustomerId ? resolveCustomerId(trimmedName) : null;
    if (!customerId) customerId = `${BY_NAME_PREFIX}${trimmedName}`;
  }

  const entries = listOf(record['ALLINVENTORYENTRIES.LIST']);
  const lines = entries.map(entry => {
    const itemName = entry.STOCKITEMNAME || null;
    const rateSplit = splitNumberSlashUnit(entry.RATE);
    const actualQty = splitNumberSpaceUnit(entry.ACTUALQTY);
    const billedQty = splitNumberSpaceUnit(entry.BILLEDQTY);

    if (entry.RATE != null && rateSplit.value == null) {
      warnings.push({ message: `Sales voucher ${invoiceNo || '?'}, item "${itemName}": RATE "${entry.RATE}" could not be parsed as "<number>/<unit>"`, field: 'rate' });
    }
    if (entry.ACTUALQTY != null && actualQty.value == null) {
      warnings.push({ message: `Sales voucher ${invoiceNo || '?'}, item "${itemName}": ACTUALQTY "${entry.ACTUALQTY}" could not be parsed as "<number> <unit>"`, field: 'qty' });
    }
    if (actualQty.value != null && billedQty.value != null && actualQty.value !== billedQty.value) {
      warnings.push({ message: `Sales voucher ${invoiceNo || '?'}, item "${itemName}": ACTUALQTY (${actualQty.value}) != BILLEDQTY (${billedQty.value})`, field: 'qty' });
    }

    return {
      item_id: null, // resolved by xmlImporter.js once the item's write step has run
      item_name: itemName,
      hsn_sac: null,
      unit: rateSplit.unit || actualQty.unit || null,
      qty_paid: actualQty.value != null ? actualQty.value : 0,
      qty_free: 0,
      rate: rateSplit.value != null ? rateSplit.value : 0,
      is_inclusive: false,
      discount_pct: 0,
      discount_amt: entry.DISCOUNT != null ? parseTrimmedNumber(entry.DISCOUNT) : 0,
      gst_rate: 0, // filled in from the resolved item at execution time
      cess_rate: 0,
      batch_id: null,
      __rateUnparseable: entry.RATE != null && rateSplit.value == null,
      __qtyUnparseable: entry.ACTUALQTY != null && actualQty.value == null
    };
  });

  const dto = createSaleDTO({
    invoiceNo,
    invoiceDate,
    customerId,
    lines,
    totals: {},
    payment: null,
    meta: {
      source: 'tally-xml',
      reference: record.REFERENCE || null,
      partyLedgerName,
      ledgerEntriesSum: sumLedgerEntries(record)
    }
  });

  return { dto, warnings };
}
