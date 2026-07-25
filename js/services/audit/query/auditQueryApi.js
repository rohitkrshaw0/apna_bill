// query/auditQueryApi.js
// The Audit Query API (Milestone 11E section "Audit Query API"): five
// reusable lookup functions, infrastructure only -- no UI, no screens.
// Written entirely against store/auditStore.js's IAuditStore contract
// (append/getById/list), never against the in-memory implementation's own
// internals, so a future store swap (see that file's own header comment)
// needs no change here.
//
// "Lookup by trace id" matches EITHER `traceContext.traceId` (a field
// real publishers can set explicitly via `context: { traceId }` today,
// though as of Milestone 11D no real call site does) OR
// `traceContext.correlationId` (always present -- diagnostics generates
// one per event when the publisher didn't supply one, see
// diagnostics/trace/traceContext.js). Both identify "this observation
// belongs to the same logical operation as that one," which is exactly
// what "lookup by trace id" means in practice -- checking only `traceId`
// would make this function permanently unusable until some future
// milestone starts setting it.

import { assertValidAuditStore } from '../store/auditStore.js';

/**
 * @param {import('../store/auditStore.js').createInMemoryAuditStore extends () => infer S ? S : never} store any object satisfying assertValidAuditStore()
 */
export function createAuditQueryApi (store) {
  if (!assertValidAuditStore(store)) {
    throw new TypeError('createAuditQueryApi: store does not satisfy the IAuditStore contract (append/getById/list)');
  }

  /** @param {string} auditId @returns {import('../contracts/auditRecord.js').AuditRecord|null} */
  function byAuditId (auditId) {
    return store.getById(auditId);
  }

  /** @param {string} aggregate @param {*} [aggregateId] omit to get every record for the aggregate type */
  function byAggregate (aggregate, aggregateId) {
    return store.list().filter((r) => r.aggregate === aggregate && (aggregateId === undefined || r.aggregateId === aggregateId));
  }

  /** @param {string} eventType */
  function byEventType (eventType) {
    return store.list().filter((r) => r.eventType === eventType);
  }

  /** @param {string} fromIso @param {string} toIso inclusive ISO-8601 bounds, compared as strings (safe: ISO-8601 sorts lexicographically) */
  function byTimeRange (fromIso, toIso) {
    return store.list().filter((r) => r.timestamp >= fromIso && r.timestamp <= toIso);
  }

  /** @param {string} traceId matches traceContext.traceId or traceContext.correlationId -- see header comment */
  function byTraceId (traceId) {
    return store.list().filter((r) => r.traceContext?.traceId === traceId || r.traceContext?.correlationId === traceId);
  }

  return { byAuditId, byAggregate, byEventType, byTimeRange, byTraceId };
}
