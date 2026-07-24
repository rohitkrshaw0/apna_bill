// dto/itemDTO.js
// Format-independent Item shape.

import { createDTO } from './baseDTO.js';

export function createItemDTO ({
  id = null, name, code = null, kind = 'goods', unit = 'PCS',
  hsnSac = null, gstRate = 0, cessRate = 0,
  trackStock = true, trackBatches = false, meta = {}
} = {}) {
  return createDTO('item', { id, name, code, kind, unit, hsnSac, gstRate, cessRate, trackStock, trackBatches, meta });
}
