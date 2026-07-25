// store/auditStore.js
// The Audit Store abstraction (Milestone 11E section "Audit Store"): "the
// implementation must be abstracted. Do not tightly couple the platform to
// one storage implementation." `assertValidAuditStore()` is the contract
// every store implementation must satisfy (`append`/`getById`/`list`,
// duck-typed, same capability-check convention
// dataExchange/migration/migrationAdapter.js already uses for its own
// adapters) -- the subscriber and query API are written against this
// contract only, never against the in-memory implementation's internals.
//
// `createInMemoryAuditStore()` is the one reference implementation this
// milestone ships. It is DELIBERATELY unbounded -- unlike
// diagnostics/timeline/executionTimeline.js's or
// jobs/dispatcher/jobDispatcher.js's own capped ring buffers, an audit
// store that silently evicted old records would violate this platform's
// own hard "never deleted, append-only" guarantee (the brief's own
// wording: "must never... Never deleted"). This is a real, disclosed
// tension for a long-running browser session with a very high event
// volume (memory grows without bound) -- resolved by the abstraction
// itself: a future milestone can implement `assertValidAuditStore()`
// against a real persistent store (e.g. a dedicated Postgres audit table
// via its own RPC, added in a future milestone with an explicit schema
// change -- not authorized here) without changing the subscriber, the
// query API, or any test written against this contract. See
// docs/audit-platform-architecture.md section "Storage abstraction" for
// the full rationale.

/**
 * @param {*} store
 * @returns {boolean}
 */
export function assertValidAuditStore (store) {
  return !!store
    && typeof store.append === 'function'
    && typeof store.getById === 'function'
    && typeof store.list === 'function';
}

/**
 * @param {import('../contracts/auditRecord.js').AuditRecord} record
 */

/**
 * The one reference IAuditStore implementation: in-memory, unbounded,
 * append-only. Records are already frozen by createAuditRecord() before
 * they ever reach append() -- this store does not freeze them itself, it
 * only ever pushes and reads references.
 */
export function createInMemoryAuditStore () {
  /** @type {import('../contracts/auditRecord.js').AuditRecord[]} */
  const records = [];
  const byId = new Map();

  /** @param {import('../contracts/auditRecord.js').AuditRecord} record */
  function append (record) {
    records.push(record);
    byId.set(record.auditId, record);
    return record;
  }

  /** @param {string} auditId @returns {import('../contracts/auditRecord.js').AuditRecord|null} */
  function getById (auditId) {
    return byId.get(auditId) || null;
  }

  /** @returns {import('../contracts/auditRecord.js').AuditRecord[]} every record, in append order */
  function list () {
    return records.slice();
  }

  /** @returns {number} */
  function count () {
    return records.length;
  }

  return { append, getById, list, count };
}
