// cache/insightCache.js
// A small, in-memory, TTL-based memoization cache -- the milestone brief's
// own "if expensive calculations exist, cache them using scheduled jobs...
// do NOT create another scheduler" applies to the JOB that keeps this warm
// (jobs/refreshInventoryInsightsJob.js reuses the existing Job Engine for
// that); this file is just the cache STORE itself, not a scheduler. Keyed
// by companyId + an operation-specific cache key so different insights for
// different companies never collide.

import { DEFAULT_CACHE_TTL_MS } from '../shared/config.js';

export function createInsightCache ({ ttlMs = DEFAULT_CACHE_TTL_MS } = {}) {
  /** @type {Map<string, {value: *, expiresAt: number}>} */
  const store = new Map();

  function buildKey (companyId, cacheKey) {
    return `${companyId}::${cacheKey}`;
  }

  /**
   * @param {string} companyId
   * @param {string} cacheKey
   * @returns {*} the cached value, or undefined if missing/expired
   */
  function get (companyId, cacheKey) {
    const entry = store.get(buildKey(companyId, cacheKey));
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(buildKey(companyId, cacheKey));
      return undefined;
    }
    return entry.value;
  }

  /**
   * @param {string} companyId
   * @param {string} cacheKey
   * @param {*} value
   */
  function set (companyId, cacheKey, value) {
    store.set(buildKey(companyId, cacheKey), { value, expiresAt: Date.now() + ttlMs });
  }

  /** Invalidates every cached entry for one company (e.g. after a stock-changing event). @param {string} companyId */
  function invalidateCompany (companyId) {
    const prefix = `${companyId}::`;
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  }

  function clear () {
    store.clear();
  }

  function size () {
    return store.size;
  }

  return { get, set, invalidateCompany, clear, size };
}

/** The application-wide insight cache instance. */
export const insightCache = createInsightCache();
