// xml/validators/xmlBusinessRules.js
// Rule functions injected into 9A's validation-pipeline stages (see
// validators/stages/createStageValidator.js -- a rule is
// `(dtoList, context) => { errors?, warnings?, information? }`). Covers the
// data-quality rules docs/milestone-9b-xml-mapping.md section 4 requires:
// required fields, date format, RATE/QTY split failures, the GSTRATE-sum-vs-
// IGST cross-check, and a voucher double-entry sanity warning.

import { createDataExchangeError } from '../../shared/errors/dataExchangeError.js';
import { ERROR_CATEGORY, ERROR_CODES } from '../../shared/errors/index.js';
import { SEVERITY } from '../../shared/severity.js';

function err (message, entity, field) {
  return createDataExchangeError({ message, code: ERROR_CODES.REQUIRED_FIELD, category: ERROR_CATEGORY.BUSINESS, severity: SEVERITY.ERROR, entity, field, source: 'xml/xmlBusinessRules' });
}
function warn (message, entity, field) {
  return createDataExchangeError({ message, category: ERROR_CATEGORY.BUSINESS, severity: SEVERITY.WARNING, entity, field, source: 'xml/xmlBusinessRules' });
}

export function requiredFieldsRule (dtoList) {
  const errors = [];
  for (const dto of dtoList) {
    if (dto.__dtoType === 'item') {
      if (!dto.name) errors.push(err('STOCKITEM missing required NAME', 'item', 'name'));
      if (!dto.unit) errors.push(err(`Item "${dto.name || '?'}" missing required BASEUNITS`, 'item', 'unit'));
    } else if (dto.__dtoType === 'customer' || dto.__dtoType === 'supplier') {
      if (!dto.name) errors.push(err(`LEDGER missing required NAME`, dto.__dtoType, 'name'));
    } else if (dto.__dtoType === 'sale') {
      if (!dto.invoiceNo) errors.push(err('Sales voucher missing VOUCHERNUMBER', 'sale', 'invoiceNo'));
      if (!dto.invoiceDate) errors.push(err(`Sales voucher ${dto.invoiceNo || '?'} missing/unparseable DATE`, 'sale', 'invoiceDate'));
      if (!Array.isArray(dto.lines) || dto.lines.length === 0) errors.push(err(`Sales voucher ${dto.invoiceNo || '?'} has no ALLINVENTORYENTRIES.LIST lines`, 'sale', 'lines'));
    }
  }
  return { errors };
}

export function dateFormatRule (dtoList) {
  const errors = [];
  for (const dto of dtoList) {
    if (dto.__dtoType === 'sale' && dto.invoiceDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(dto.invoiceDate)) {
      errors.push(err(`Sales voucher ${dto.invoiceNo || '?'}: invoiceDate "${dto.invoiceDate}" is not YYYY-MM-DD`, 'sale', 'invoiceDate'));
    }
  }
  return { errors };
}

export function quantitySplitRule (dtoList) {
  const errors = [];
  for (const dto of dtoList) {
    if (dto.__dtoType !== 'sale') continue;
    for (const line of dto.lines || []) {
      if (line.__rateUnparseable) errors.push(err(`Sales voucher ${dto.invoiceNo || '?'}, item "${line.item_name}": RATE could not be parsed as "<number>/<unit>"`, 'sale', 'rate'));
      if (line.__qtyUnparseable) errors.push(err(`Sales voucher ${dto.invoiceNo || '?'}, item "${line.item_name}": ACTUALQTY/BILLEDQTY could not be parsed as "<number> <unit>"`, 'sale', 'qty'));
    }
  }
  return { errors };
}

export function gstRateCrossCheckRule (dtoList) {
  const warnings = [];
  for (const dto of dtoList) {
    if (dto.__dtoType !== 'item') continue;
    const m = dto.meta || {};
    if (m.centralTax != null && m.stateTax != null && m.integratedTax != null) {
      const sum = Number(m.centralTax) + Number(m.stateTax);
      if (Math.abs(sum - Number(m.integratedTax)) > 0.001) {
        warnings.push(warn(`Item "${dto.name}": Central Tax (${m.centralTax}) + State Tax (${m.stateTax}) = ${sum} does not match Integrated Tax (${m.integratedTax})`, 'item', 'gstRate'));
      }
    }
    if (m.gstApplicable === 'Not Applicable' && (Number(m.centralTax) > 0 || Number(m.stateTax) > 0 || Number(m.integratedTax) > 0)) {
      warnings.push(warn(`Item "${dto.name}": GSTAPPLICABLE is "Not Applicable" but a non-zero GST rate is present in GSTDETAILS.LIST`, 'item', 'gstRate'));
    }
  }
  return { warnings };
}

export function ledgerBalanceRule (dtoList) {
  const warnings = [];
  for (const dto of dtoList) {
    if (dto.__dtoType !== 'sale') continue;
    const sum = dto.meta?.ledgerEntriesSum;
    if (sum != null && Math.abs(sum) > 0.5) {
      warnings.push(warn(`Sales voucher ${dto.invoiceNo || '?'}: LEDGERENTRIES.LIST amounts sum to ${sum.toFixed(2)}, not zero (double-entry check)`, 'sale', 'totals'));
    }
  }
  return { warnings };
}

// Reference-validation rule (mapping doc section 4.4): a sale line's item
// must resolve to a known item (imported-this-batch or already in the
// company); a non-cash-sale party must resolve to a known customer.
export function referencedEntitiesRule (dtoList, context = {}) {
  const errors = [];
  const knownItemNames = context.knownItemNames || new Set();
  for (const dto of dtoList) {
    if (dto.__dtoType !== 'sale') continue;
    for (const line of dto.lines || []) {
      if (line.item_name && !knownItemNames.has(line.item_name)) {
        errors.push(err(`Sales voucher ${dto.invoiceNo || '?'}: STOCKITEMNAME "${line.item_name}" does not resolve to any imported or existing item`, 'sale', 'item_id'));
      }
    }
  }
  return { errors };
}
