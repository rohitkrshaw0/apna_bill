// json/rules/jsonBusinessRules.js
// Rule functions injected into validators/stages' createBusinessValidator/
// createReferenceValidator (same shape xmlBusinessRules.js already
// establishes: `(dtoList, context) => { errors?, warnings?, information? }`),
// shared by BOTH jsonExporter.js and jsonImporter.js -- unlike XML, which
// splits business rules across import (xmlBusinessRules.js) and export
// (xmlExportRules.js) because import-only text-parse-failure flags
// (__rateUnparseable/__qtyUnparseable) can't occur on export. JSON's DTOs
// are already-typed numbers on BOTH sides (a DB read on export, JSON.parse
// on import) -- there is no such failure mode here, so one shared rule set
// correctly and safely serves both directions.
//
// dateFormatRule/gstRateCrossCheckRule are reused directly from
// xml/validators/xmlBusinessRules.js unchanged (re-exported below) -- their
// error text names no Tally tag, see milestone-10-json-design.md section 3.
// requiredFieldsRule/referencedEntitiesRule/duplicateNameWithinBatchRule are
// reimplemented here with JSON-appropriate wording (same underlying checks,
// no Tally terminology) for the same reason xmlExportRules.js wrote its own
// duplicateNameWithinBatchRule instead of stretching an import-side rule.

import { createDataExchangeError } from '../../shared/errors/dataExchangeError.js';
import { ERROR_CATEGORY, ERROR_CODES } from '../../shared/errors/index.js';
import { SEVERITY } from '../../shared/severity.js';
import { dateFormatRule, gstRateCrossCheckRule } from '../../xml/validators/xmlBusinessRules.js';

export { dateFormatRule, gstRateCrossCheckRule };

function err (message, entity, field) {
  return createDataExchangeError({ message, code: ERROR_CODES.REQUIRED_FIELD, category: ERROR_CATEGORY.BUSINESS, severity: SEVERITY.ERROR, entity, field, source: 'json/jsonBusinessRules' });
}
function dup (message, entity, field) {
  return createDataExchangeError({ message, category: ERROR_CATEGORY.DUPLICATE, severity: SEVERITY.ERROR, entity, field, source: 'json/jsonBusinessRules' });
}

export function requiredFieldsRule (dtoList) {
  const errors = [];
  for (const dto of dtoList) {
    if (dto.__dtoType === 'item') {
      if (!dto.name) errors.push(err('Item record is missing required field "name"', 'item', 'name'));
      if (!dto.unit) errors.push(err(`Item "${dto.name || '?'}" is missing required field "unit"`, 'item', 'unit'));
    } else if (dto.__dtoType === 'customer' || dto.__dtoType === 'supplier') {
      if (!dto.name) errors.push(err(`${dto.__dtoType} record is missing required field "name"`, dto.__dtoType, 'name'));
    } else if (dto.__dtoType === 'sale') {
      if (!dto.invoiceNo) errors.push(err('Sale record is missing required field "invoiceNo"', 'sale', 'invoiceNo'));
      if (!dto.invoiceDate) errors.push(err(`Sale ${dto.invoiceNo || '?'} is missing/unparseable "invoiceDate"`, 'sale', 'invoiceDate'));
      if (!Array.isArray(dto.lines) || dto.lines.length === 0) errors.push(err(`Sale ${dto.invoiceNo || '?'} has no line items`, 'sale', 'lines'));
    }
  }
  return { errors };
}

// Reference-validation: a sale line's item must resolve to a known item
// (imported-this-batch or already in the target company); mirrors
// xml/validators/xmlBusinessRules.js's referencedEntitiesRule exactly, JSON
// wording only.
export function referencedEntitiesRule (dtoList, context = {}) {
  const errors = [];
  const knownItemNames = context.knownItemNames || new Set();
  for (const dto of dtoList) {
    if (dto.__dtoType !== 'sale') continue;
    for (const line of dto.lines || []) {
      if (line.item_name && !knownItemNames.has(line.item_name)) {
        errors.push(err(`Sale ${dto.invoiceNo || '?'}: line item "${line.item_name}" does not resolve to any imported or existing item`, 'sale', 'item_id'));
      }
    }
  }
  return { errors };
}

function normalizeName (s) { return String(s ?? '').trim().toLowerCase(); }

// Export-side gate: two records of the same type sharing a name would
// collide once re-imported by name (see jsonImporter.js's reference
// resolution, milestone-10-json-design.md section 8) -- catch it before the
// file is ever written, mirroring xmlExportRules.js's own
// duplicateNameWithinBatchRule.
export function duplicateNameWithinBatchRule (dtoList) {
  const errors = [];
  const seenByType = new Map();

  for (const dto of dtoList) {
    if (dto.__dtoType !== 'item' && dto.__dtoType !== 'customer' && dto.__dtoType !== 'supplier') continue;
    if (!seenByType.has(dto.__dtoType)) seenByType.set(dto.__dtoType, new Map());
    const seen = seenByType.get(dto.__dtoType);
    const key = normalizeName(dto.name);
    if (!key) continue;
    if (seen.has(key)) {
      errors.push(dup(`Two ${dto.__dtoType}s named "${dto.name}" would collide once re-imported by name`, dto.__dtoType, 'name'));
    } else {
      seen.set(key, dto);
    }
  }

  return { errors };
}
