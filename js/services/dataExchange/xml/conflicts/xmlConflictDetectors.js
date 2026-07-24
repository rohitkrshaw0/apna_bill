// xml/conflicts/xmlConflictDetectors.js
// Detector functions for 9A's createConflictEngine (a detector is
// `(existingRecords, incomingRecords) => Conflict[]`). Each checks against
// the current company's existing DB rows -- direct reads, new code, doesn't
// touch items.js/suppliers.js/sales.js. See mapping doc section 4.6.

import { createConflict } from '../../conflicts/conflict.js';

function normalizeName (s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

export function duplicateItemNameDetector (existingItems = [], incomingItemDTOs = []) {
  const byName = new Map(existingItems.map(i => [normalizeName(i.name), i]));
  const conflicts = [];
  for (const dto of incomingItemDTOs) {
    const match = byName.get(normalizeName(dto.name));
    if (match) {
      conflicts.push(createConflict({
        entityType: 'item', existingRecord: match, incomingRecord: dto,
        recommendedAction: 'skip', reason: `An item named "${dto.name}" already exists in this company`
      }));
    }
  }
  return conflicts;
}

export function duplicateLedgerNameDetector (existingParties = [], incomingPartyDTOs = []) {
  const byName = new Map(existingParties.map(p => [normalizeName(p.name), p]));
  const conflicts = [];
  for (const dto of incomingPartyDTOs) {
    const match = byName.get(normalizeName(dto.name));
    if (match) {
      conflicts.push(createConflict({
        entityType: dto.__dtoType, existingRecord: match, incomingRecord: dto,
        recommendedAction: 'skip', reason: `A ${dto.__dtoType} named "${dto.name}" already exists in this company`
      }));
    }
  }
  return conflicts;
}

export function duplicateInvoiceNumberDetector (existingInvoices = [], incomingSaleDTOs = []) {
  const byNo = new Map(existingInvoices.map(i => [String(i.invoice_no).trim(), i]));
  const conflicts = [];
  for (const dto of incomingSaleDTOs) {
    const match = dto.invoiceNo ? byNo.get(String(dto.invoiceNo).trim()) : null;
    if (match) {
      conflicts.push(createConflict({
        entityType: 'sale', existingRecord: match, incomingRecord: dto,
        recommendedAction: 'rename', reason: `Invoice number "${dto.invoiceNo}" already exists for this firm/fiscal year`
      }));
    }
  }
  return conflicts;
}
