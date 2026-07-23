// dto/purchaseDTO.js
// Format-independent Purchase (bill) shape. Lines stay plain objects inside
// the DTO -- the spec lists Purchase as one DTO, not Purchase + PurchaseLine.

import { createDTO } from './baseDTO.js';

export function createPurchaseDTO ({
  id = null, billNo = null, billDate, supplierId = null,
  lines = [], totals = {}, payment = null, meta = {}
} = {}) {
  return createDTO('purchase', { id, billNo, billDate, supplierId, lines, totals, payment, meta });
}
