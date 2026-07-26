// calculators/inventoryValueCalculator.js
// Pure calculation only -- no I/O, no formatting, no HTML, no business
// workflow (per the milestone brief's own "Calculators" section). Every
// function here takes plain data already loaded by inventory/
// inventoryDataLoader.js and returns a plain number or plain object.

/**
 * @param {{qtyOnHand: number, costPrice: number}} batch
 * @returns {number} this single batch's contribution to inventory value
 */
export function calculateBatchValue (batch) {
  return (batch.qtyOnHand || 0) * (batch.costPrice || 0);
}

/**
 * @param {object[]} batches every batch row for one item (from batchesByItem)
 * @returns {{totalQty: number, totalValue: number, avgCost: number|null}}
 *   avgCost is the qty-weighted average of the batches' own cost_price --
 *   the item's CURRENT stock cost basis, not a historical average purchase
 *   price (that would require scanning purchase_lines' own dated history,
 *   out of scope for this metric -- see architecture doc).
 */
export function calculateInventoryValueForItem (batches) {
  let totalQty = 0;
  let totalValue = 0;
  for (const batch of batches) {
    totalQty += batch.qtyOnHand || 0;
    totalValue += calculateBatchValue(batch);
  }
  return {
    totalQty,
    totalValue,
    avgCost: totalQty > 0 ? totalValue / totalQty : null
  };
}

/**
 * @param {{inventoryValue: number}[]} itemMetricsList
 * @returns {number} sum of every item's own inventoryValue
 */
export function calculateTotalInventoryValue (itemMetricsList) {
  return itemMetricsList.reduce((sum, m) => sum + (m.inventoryValue || 0), 0);
}
