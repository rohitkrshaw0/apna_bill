// dto/saleDTO.js
// Format-independent Sale (invoice) shape.

import { createDTO } from './baseDTO.js';

export function createSaleDTO ({
  id = null, invoiceNo = null, invoiceDate, customerId = null,
  lines = [], totals = {}, payment = null, meta = {}
} = {}) {
  return createDTO('sale', { id, invoiceNo, invoiceDate, customerId, lines, totals, payment, meta });
}
