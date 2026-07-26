// metrics/itemMetrics.js
// Reusable, per-item metrics (milestone brief section "Inventory Metrics").
// Pure function: takes the InventorySnapshot inventory/inventoryDataLoader.js
// already loaded and returns one metric object per item. Every calculator
// under calculators/ is invoked exactly once per item here -- this is the
// "one inventory scan powers multiple insights" seam: every aggregator
// downstream (aggregators/) consumes this same array instead of
// re-deriving any of these numbers itself.

import { calculateInventoryValueForItem } from '../calculators/inventoryValueCalculator.js';
import { calculateStockAgeForItem } from '../calculators/stockAgeCalculator.js';
import {
  calculateQtySoldInWindow, calculateQtyPurchasedInWindow, calculateCogsInWindow,
  calculateDailySalesVelocity, calculateDaysOfCover, calculateTurnoverRatio
} from '../calculators/turnoverCalculator.js';
import { resolveCategory } from '../calculators/categoryCalculator.js';
import { MS_PER_DAY } from '../shared/config.js';

function daysSince (isoDate, asOfDate) {
  if (!isoDate) return null;
  const diff = asOfDate.getTime() - new Date(isoDate).getTime();
  return diff >= 0 ? Math.floor(diff / MS_PER_DAY) : 0;
}

function latestDate (ledgerRows, txnType) {
  let latest = null;
  for (const row of ledgerRows) {
    if (row.txnType !== txnType) continue;
    if (!latest || row.txnDate > latest) latest = row.txnDate;
  }
  return latest;
}

/**
 * Reserved/available stock: this schema has no sales-order or reservation
 * concept (no table anywhere holds a "committed but not yet shipped"
 * quantity) -- reservedStock is always 0 and availableStock always equals
 * currentStock. Documented here rather than silently omitted, per the
 * milestone brief's own "Reserved Stock (if existing)" wording.
 */
function computeCurrentStock (item, batches, aggregateStockByItem) {
  if (!item.trackStock) return 0;
  if (item.trackBatches) return batches.reduce((sum, b) => sum + (b.qtyOnHand || 0), 0);
  return aggregateStockByItem.get(item.id) || 0;
}

function computeAvgSellingPrice (invoiceLines) {
  const totalQty = invoiceLines.reduce((sum, l) => sum + (l.qty || 0), 0);
  if (totalQty <= 0) return null;
  const totalRevenue = invoiceLines.reduce((sum, l) => sum + (l.qty || 0) * (l.rate || 0), 0);
  return totalRevenue / totalQty;
}

/**
 * @param {import('../inventory/inventoryDataLoader.js').InventorySnapshot} snapshot
 * @returns {object[]} one metric object per item
 */
export function computeItemMetrics (snapshot) {
  const asOfDate = new Date(snapshot.generatedAt);
  const { lookbackDays } = snapshot;

  return snapshot.items.map((item) => {
    const batches = snapshot.batchesByItem.get(item.id) || [];
    const ledger = snapshot.ledgerByItem.get(item.id) || [];
    const invoiceLines = snapshot.invoiceLinesByItem.get(item.id) || [];

    const currentStock = computeCurrentStock(item, batches, snapshot.aggregateStockByItem);
    const { totalValue: inventoryValue, avgCost } = calculateInventoryValueForItem(batches);

    const qtySoldInWindow = calculateQtySoldInWindow(ledger);
    const qtyPurchasedInWindow = calculateQtyPurchasedInWindow(ledger);
    const cogsInWindow = calculateCogsInWindow(ledger);
    const dailySalesVelocity = calculateDailySalesVelocity(qtySoldInWindow, lookbackDays);
    const daysOfCover = calculateDaysOfCover(currentStock, dailySalesVelocity);
    const turnoverRatio = calculateTurnoverRatio({ cogsInWindow, inventoryValue, lookbackDays });

    const lastSaleDate = latestDate(ledger, 'sale');
    const lastPurchaseDate = latestDate(ledger, 'purchase');

    return {
      itemId: item.id,
      code: item.code,
      name: item.name,
      kind: item.kind,
      unit: item.unit,
      category: resolveCategory(item),
      isActive: item.isActive,
      trackStock: item.trackStock,
      trackBatches: item.trackBatches,
      lowStockThreshold: item.lowStockThreshold,

      currentStock,
      availableStock: currentStock,
      reservedStock: 0,

      inventoryValue,
      avgCost,
      avgSellingPrice: computeAvgSellingPrice(invoiceLines),

      lastPurchaseDate,
      lastSaleDate,
      daysSinceLastPurchase: daysSince(lastPurchaseDate, asOfDate),
      daysSinceLastSale: daysSince(lastSaleDate, asOfDate),

      stockAgeDays: calculateStockAgeForItem(batches, asOfDate),

      qtySoldInWindow,
      qtyPurchasedInWindow,
      cogsInWindow,
      dailySalesVelocity,
      daysOfCover,
      turnoverRatio
    };
  });
}
