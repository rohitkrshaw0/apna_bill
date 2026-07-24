// xml/mapping/masters/itemMapper.js
// <STOCKITEM> -> itemDTO. See docs/milestone-9b-xml-mapping.md section 3.4.

import { createItemDTO } from '../../../dto/itemDTO.js';
import { stripControlPrefix, splitNumberSpaceUnit, parseTrimmedNumber } from '../parseHelpers.js';

function listOf (value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function extractGstDetails (record) {
  const list = listOf(record['GSTDETAILS.LIST'])[0];
  if (!list) return { gstRate: 0, cessRate: 0, hsnSac: null, centralTax: null, stateTax: null, integratedTax: null };

  const hsnSac = list.HSNCODE || null;
  const stateWise = listOf(list['STATEWISEDETAILS.LIST'])[0];
  const rateDetails = stateWise ? listOf(stateWise['RATEDETAILS.LIST']) : [];

  let centralTax = null, stateTax = null, integratedTax = null, cess = 0;
  for (const rd of rateDetails) {
    const head = rd.GSTRATEDUTYHEAD;
    const rate = rd.GSTRATE != null ? parseTrimmedNumber(rd.GSTRATE) : 0;
    if (head === 'Central Tax') centralTax = rate;
    else if (head === 'State Tax') stateTax = rate;
    else if (head === 'Integrated Tax') integratedTax = rate;
    else if (head === 'Cess') cess = rate;
  }
  return {
    gstRate: (centralTax || 0) + (stateTax || 0),
    cessRate: cess,
    hsnSac,
    centralTax, stateTax, integratedTax
  };
}

function extractOpeningBatches (record) {
  return listOf(record['BATCHALLOCATIONS.LIST']).map(b => {
    const opening = splitNumberSpaceUnit(b.OPENINGBALANCE);
    return {
      godownName: b.GODOWNNAME || null,
      batchNo: b.BATCHNAME || null,
      openingQty: opening.value,
      openingUnit: opening.unit,
      openingValue: b.OPENINGVALUE != null ? parseTrimmedNumber(b.OPENINGVALUE) : 0
    };
  });
}

/**
 * @param {object} record a raw STOCKITEM record from tallyXmlParser
 * @returns {{ dto: object, openingQty: number|null, openingUnit: string|null, batches: object[], warnings: object[] }}
 */
export function mapStockItemRecord (record) {
  const warnings = [];
  const name = record['@NAME'] || null;
  const unit = record.BASEUNITS || null;
  const gstApplicable = stripControlPrefix(record.GSTAPPLICABLE);
  const { gstRate, cessRate, hsnSac, centralTax, stateTax, integratedTax } = extractGstDetails(record);
  const notApplicable = gstApplicable === 'Not Applicable';
  const trackBatches = record.ISBATCHWISEON === 'Yes';
  const opening = splitNumberSpaceUnit(record.OPENINGBALANCE);

  if (record.OPENINGBALANCE != null && opening.value == null) {
    warnings.push({ message: `Item "${name}": OPENINGBALANCE "${record.OPENINGBALANCE}" could not be parsed as "<number> <unit>"`, field: 'openingBalance' });
  }

  const dto = createItemDTO({
    name,
    unit: unit || 'PCS',
    hsnSac,
    gstRate: notApplicable ? 0 : gstRate,
    cessRate: notApplicable ? 0 : cessRate,
    trackStock: true,
    trackBatches,
    meta: { source: 'tally-xml', gstApplicable, centralTax, stateTax, integratedTax }
  });

  return { dto, openingQty: opening.value, openingUnit: opening.unit, batches: extractOpeningBatches(record), warnings };
}
