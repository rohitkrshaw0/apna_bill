// dto/manufacturingDTO.js
// Format-independent Manufacturing run shape.

import { createDTO } from './baseDTO.js';

export function createManufacturingDTO ({
  id = null, runNo = null, runDate, producedItemId = null, producedQty = 0,
  overheadCost = 0, consumed = [], meta = {}
} = {}) {
  return createDTO('manufacturing', { id, runNo, runDate, producedItemId, producedQty, overheadCost, consumed, meta });
}
