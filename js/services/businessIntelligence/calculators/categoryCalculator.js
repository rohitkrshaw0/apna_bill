// calculators/categoryCalculator.js
// Pure calculation only. items (schema.sql) has no dedicated "category"
// column -- the database schema is frozen, and this milestone does not add
// one. hsn_sac (the GST tax-classification code every item already
// carries) is the closest existing grouping dimension that behaves like a
// product category in Indian retail practice (items sharing an HSN/SAC
// code are, in practice, the same class of goods) -- used here as a
// deliberate, disclosed proxy, documented in
// docs/architecture/business-intelligence.md, not a new schema concept.

export const UNCATEGORIZED = 'Uncategorized';

/** @param {{hsnSac: string|null}} item @returns {string} */
export function resolveCategory (item) {
  const code = (item.hsnSac || '').trim();
  return code || UNCATEGORIZED;
}

/**
 * @param {object[]} itemMetricsList each with a `category` field already set
 * @returns {Map<string, object[]>} category -> item metrics in that category
 */
export function groupMetricsByCategory (itemMetricsList) {
  const map = new Map();
  for (const m of itemMetricsList) {
    const key = m.category || UNCATEGORIZED;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return map;
}
