// xml/export/mapping/masters/itemExportMapper.js
// ERP-agnostic: item row -> itemDTO, plus the opening-stock siblings itemDTO
// has no field for. No Tally tag names, no GST-rate splitting into Central/
// State/Integrated Tax, no ISBATCHWISEON/GSTAPPLICABLE string encoding --
// all of that is tallyXmlFormatterV1.js's job, not this file's.
//
// meta.centralTax/stateTax/integratedTax is populated purely so the reused
// import-side gstRateCrossCheckRule (xml/validators/xmlBusinessRules.js) can
// validate before formatting -- a numeric consistency value, not a
// structural/tag decision, so it stays here rather than in the formatter.

import { createItemDTO } from '../../../../dto/itemDTO.js';

/**
 * @param {object} item a row from the `items` table
 * @param {object} opts { openingQty, openingUnit, batches } -- opening stock
 *   data, present only where a genuine stock_ledger txn_type='opening' row
 *   exists (see dataReaders.js); null/empty otherwise, never fabricated.
 */
export function mapItemToExportDTO (item, { openingQty = null, openingUnit = null, batches = [] } = {}) {
  const gstRate = Number(item.gst_rate) || 0;

  const dto = createItemDTO({
    id: item.id,
    name: item.name,
    code: item.code || null,
    kind: item.kind || 'goods',
    unit: item.unit || 'PCS',
    hsnSac: item.hsn_sac || null,
    gstRate,
    cessRate: Number(item.cess_rate) || 0,
    trackStock: !!item.track_stock,
    trackBatches: !!item.track_batches,
    meta: {
      source: 'apnabill',
      centralTax: gstRate / 2,
      stateTax: gstRate / 2,
      integratedTax: gstRate
    }
  });

  return { dto, openingQty, openingUnit, batches };
}
