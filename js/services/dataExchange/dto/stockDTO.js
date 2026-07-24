// dto/stockDTO.js
// Format-independent Stock (batch/ledger position) shape.

import { createDTO } from './baseDTO.js';

export function createStockDTO ({
  itemId, batchId = null, batchLabel = null, qtyOnHand = 0, costPrice = null, meta = {}
} = {}) {
  return createDTO('stock', { itemId, batchId, batchLabel, qtyOnHand, costPrice, meta });
}
