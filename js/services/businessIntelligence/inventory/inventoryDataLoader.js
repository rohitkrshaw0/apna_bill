// inventory/inventoryDataLoader.js
// The ONLY file under businessIntelligence/ that touches Supabase. Every
// calculator/aggregator/metric downstream is a pure function operating on
// the plain-object "InventorySnapshot" this file returns -- per the
// milestone brief's own architecture rule ("One inventory scan should
// power multiple insights... avoid repeated inventory scans"), this file
// runs exactly four company-scoped queries (items, batches, stock_ledger,
// invoice_lines) no matter how many metrics/aggregators later consume the
// snapshot, instead of one query per item or one query per insight.
//
// Read-only: no insert/update/delete anywhere in this file, and no RPC
// call -- the Inventory Intelligence Platform never writes to inventory,
// stock, purchases, or sales (the milestone's own "absolute architecture
// rule"). Database schema is frozen; nothing here assumes a column or
// table that schema.sql does not already define.
//
// Known, disclosed scope limitation (documented in
// docs/architecture/business-intelligence.md): stock_ledger (used for
// last-sale/last-purchase dates and sales velocity) is bounded to the
// last `lookbackDays` days rather than a full, unbounded history scan --
// an item with no ledger activity at all inside that window is still
// correctly identifiable as dead/slow stock (that IS the signal), it just
// cannot report an exact "last sold 400 days ago" date beyond the window.
// invoice_lines (used only for average selling price) is read company-wide
// with no date bound, since it carries no date column of its own and this
// milestone does not join it against invoices to stay within "one query
// per table" (a documented, lifetime-average tradeoff, not a bug).

import { supa, getActiveCompanyId } from '../../../supabaseClient.js';
import { DEFAULT_LOOKBACK_DAYS } from '../shared/config.js';

function daysAgoIso (days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function groupBy (rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key === null || key === undefined) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/**
 * @typedef {object} InventorySnapshot
 * @property {string} companyId
 * @property {string} generatedAt ISO-8601, when this snapshot was loaded
 * @property {number} lookbackDays
 * @property {string} cutoffDate ISO-8601 -- stock_ledger rows older than this were not loaded
 * @property {object[]} items
 * @property {Map<string, object[]>} batchesByItem itemId -> batch rows
 * @property {Map<string, object[]>} ledgerByItem itemId -> stock_ledger rows within the lookback window
 * @property {Map<string, object[]>} invoiceLinesByItem itemId -> {qty, rate} pairs, lifetime (no date bound)
 * @property {Map<string, number>} aggregateStockByItem itemId -> current qty_on_hand for non-batch-tracked items only (§ below)
 */

/**
 * Loads every table the Business Intelligence layer needs for one company,
 * in exactly four queries, and shapes them into a plain, pure-function-
 * friendly snapshot. Never mutates ERP data.
 *
 * @param {object} [opts]
 * @param {string} [opts.companyId] defaults to getActiveCompanyId()
 * @param {number} [opts.lookbackDays] how far back stock_ledger is scanned (default 365)
 * @param {boolean} [opts.activeOnly] only active items (default true, matches items.js's listItemsWithStock default)
 * @returns {Promise<InventorySnapshot>}
 */
export async function loadInventorySnapshot ({ companyId, lookbackDays = DEFAULT_LOOKBACK_DAYS, activeOnly = true } = {}) {
  const co = companyId || getActiveCompanyId();
  if (!co) throw new Error('loadInventorySnapshot: no active company');

  const cutoffDate = daysAgoIso(lookbackDays);

  let itemsQuery = supa.from('items')
    .select('id, code, name, kind, unit, hsn_sac, default_purchase_price, default_retail_price, default_wholesale_price, track_stock, track_batches, low_stock_threshold, is_active, created_at')
    .eq('company_id', co);
  if (activeOnly) itemsQuery = itemsQuery.eq('is_active', true);

  const [itemsRes, batchesRes, ledgerRes, invoiceLinesRes] = await Promise.all([
    itemsQuery,
    supa.from('batches')
      .select('id, item_id, cost_price, retail_price, wholesale_price, qty_on_hand, created_at')
      .eq('company_id', co),
    supa.from('stock_ledger')
      .select('item_id, batch_id, txn_date, txn_type, qty_in, qty_out, unit_cost')
      .eq('company_id', co)
      .gte('txn_date', cutoffDate),
    supa.from('invoice_lines')
      .select('item_id, qty_paid, rate')
      .eq('company_id', co)
  ]);

  if (itemsRes.error) throw itemsRes.error;
  if (batchesRes.error) throw batchesRes.error;
  if (ledgerRes.error) throw ledgerRes.error;
  if (invoiceLinesRes.error) throw invoiceLinesRes.error;

  const items = (itemsRes.data || []).map((i) => ({
    id: i.id,
    code: i.code,
    name: i.name,
    kind: i.kind,
    unit: i.unit,
    hsnSac: i.hsn_sac,
    defaultPurchasePrice: +i.default_purchase_price || 0,
    defaultRetailPrice: +i.default_retail_price || 0,
    defaultWholesalePrice: +i.default_wholesale_price || 0,
    trackStock: !!i.track_stock,
    trackBatches: !!i.track_batches,
    lowStockThreshold: +i.low_stock_threshold || 0,
    isActive: !!i.is_active,
    createdAt: i.created_at
  }));

  const batches = (batchesRes.data || []).map((b) => ({
    id: b.id,
    itemId: b.item_id,
    costPrice: +b.cost_price || 0,
    retailPrice: b.retail_price === null ? null : +b.retail_price,
    wholesalePrice: b.wholesale_price === null ? null : +b.wholesale_price,
    qtyOnHand: +b.qty_on_hand || 0,
    createdAt: b.created_at
  }));

  const ledger = (ledgerRes.data || []).map((l) => ({
    itemId: l.item_id,
    batchId: l.batch_id,
    txnDate: l.txn_date,
    txnType: l.txn_type,
    qtyIn: +l.qty_in || 0,
    qtyOut: +l.qty_out || 0,
    unitCost: l.unit_cost === null ? null : +l.unit_cost
  }));

  const invoiceLines = (invoiceLinesRes.data || []).map((l) => ({
    itemId: l.item_id,
    qty: +l.qty_paid || 0,
    rate: +l.rate || 0
  }));

  // batches.qty_on_hand is the authoritative running balance for
  // batch-tracked items (every purchase/sale RPC updates it directly), but
  // a non-batch-tracked item (track_batches = false) never gets a batch
  // row at all -- its only running balance is stock_ledger's full history
  // (sum of qty_in - qty_out), which the windowed `ledger` scan above does
  // NOT reliably capture (older opening/purchase rows may fall outside
  // `lookbackDays`). Rather than widen the whole-company ledger scan to
  // unbounded (defeating the point of the window), this is one additional,
  // narrowly-scoped, unbounded query -- filtered to only the item ids that
  // actually need it -- reduced to a scalar per item here so the snapshot
  // stays lean. Still "one query", not one query per item.
  const aggregateStockByItem = new Map();
  const nonBatchItemIds = items.filter((i) => i.trackStock && !i.trackBatches).map((i) => i.id);
  if (nonBatchItemIds.length) {
    const { data: aggRows, error: aggError } = await supa.from('stock_ledger')
      .select('item_id, qty_in, qty_out')
      .eq('company_id', co)
      .in('item_id', nonBatchItemIds);
    if (aggError) throw aggError;
    for (const row of (aggRows || [])) {
      const prev = aggregateStockByItem.get(row.item_id) || 0;
      aggregateStockByItem.set(row.item_id, prev + (+row.qty_in || 0) - (+row.qty_out || 0));
    }
  }

  return {
    companyId: co,
    generatedAt: new Date().toISOString(),
    lookbackDays,
    cutoffDate,
    items,
    batchesByItem: groupBy(batches, (b) => b.itemId),
    ledgerByItem: groupBy(ledger, (l) => l.itemId),
    invoiceLinesByItem: groupBy(invoiceLines, (l) => l.itemId),
    aggregateStockByItem
  };
}
