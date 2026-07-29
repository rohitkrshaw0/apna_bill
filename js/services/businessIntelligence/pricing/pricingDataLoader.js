// pricing/pricingDataLoader.js (Milestone 12D)
// Unlike inventory/inventoryDataLoader.js (12A), purchase/purchaseDataLoader.js
// (12B), and sales/salesDataLoader.js (12C) -- each the ONLY file touching
// Supabase for their own domain -- Pricing Intelligence's defining trait is
// that it needs BOTH sell-side and buy-side per-item price history at once
// (see docs/architecture/business-intelligence-api.md's own note on this).
// Rather than duplicating either domain's queries, this loader REUSES
// loadPurchaseSnapshot()/loadSalesSnapshot() verbatim (both frozen,
// unmodified) and adds exactly ONE new query of its own: `items`, for each
// item's own configured "current" prices (default_purchase_price/
// default_retail_price/default_wholesale_price), which neither existing
// snapshot loads (both only ever load transaction-line prices, never the
// item master's own price fields). Total queries for one pricing scan:
// loadPurchaseSnapshot's 2-3 + loadSalesSnapshot's 2-3 + this file's own 1
// -- still "one query per table", never one query per item or per insight.
//
// Read-only: no insert/update/delete anywhere in this file, and no RPC
// call -- Pricing Intelligence never writes to items, purchases, sales,
// or inventory, per this milestone's own "absolute rules".

import { supa, getActiveCompanyId } from '../../../supabaseClient.js';
import { DEFAULT_LOOKBACK_DAYS } from '../shared/config.js';
import { loadPurchaseSnapshot } from '../purchase/purchaseDataLoader.js';
import { loadSalesSnapshot } from '../sales/salesDataLoader.js';

/**
 * @typedef {object} PricingSnapshot
 * @property {string} companyId
 * @property {string} generatedAt ISO-8601
 * @property {number} lookbackDays
 * @property {object[]} items every item (optionally active-only), with its own current/master prices
 * @property {Map<string, object>} itemsById itemId -> item row
 * @property {import('../purchase/purchaseDataLoader.js').PurchaseSnapshot} purchaseSnapshot reused verbatim
 * @property {import('../sales/salesDataLoader.js').SalesSnapshot} salesSnapshot reused verbatim
 */

/**
 * @param {object} [opts]
 * @param {string} [opts.companyId] defaults to getActiveCompanyId()
 * @param {number} [opts.lookbackDays] forwarded to both loadPurchaseSnapshot and loadSalesSnapshot (default 365)
 * @param {boolean} [opts.activeOnly] only active items (default true)
 * @returns {Promise<PricingSnapshot>}
 */
export async function loadPricingSnapshot ({ companyId, lookbackDays = DEFAULT_LOOKBACK_DAYS, activeOnly = true } = {}) {
  const co = companyId || getActiveCompanyId();
  if (!co) throw new Error('loadPricingSnapshot: no active company');

  const [purchaseSnapshot, salesSnapshot, itemsRes] = await Promise.all([
    loadPurchaseSnapshot({ companyId: co, lookbackDays }),
    loadSalesSnapshot({ companyId: co, lookbackDays }),
    (() => {
      let itemsQuery = supa.from('items')
        .select('id, code, name, hsn_sac, is_active, default_purchase_price, default_retail_price, default_wholesale_price')
        .eq('company_id', co);
      if (activeOnly) itemsQuery = itemsQuery.eq('is_active', true);
      return itemsQuery;
    })()
  ]);
  if (itemsRes.error) throw itemsRes.error;

  const items = (itemsRes.data || []).map((i) => ({
    id: i.id,
    code: i.code,
    name: i.name,
    hsnSac: i.hsn_sac,
    isActive: !!i.is_active,
    defaultPurchasePrice: +i.default_purchase_price || 0,
    defaultRetailPrice: +i.default_retail_price || 0,
    defaultWholesalePrice: +i.default_wholesale_price || 0
  }));

  return {
    companyId: co,
    generatedAt: new Date().toISOString(),
    lookbackDays,
    items,
    itemsById: new Map(items.map((i) => [i.id, i])),
    purchaseSnapshot,
    salesSnapshot
  };
}
