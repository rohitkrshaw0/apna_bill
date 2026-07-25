// contracts/auditRecord.js
// The one, permanent shape every audit record conforms to (Milestone 11E
// section "Audit Record Contract"). Every field the brief lists, exactly:
// auditId, eventId, eventType, aggregate, aggregateId, timestamp,
// traceContext, metadata, payload, version.
//
// `metadata` vs. `traceContext` -- deliberately both present, not
// redundant: `metadata` is the RAW context object the publishing business
// code originally supplied to eventBus.publish() (event.metadata,
// untouched); `traceContext` is diagnostics' own derived, enriched trace
// envelope (deriveTraceContextFromEvent(event) -- reuses `metadata`'s
// fields plus a generated `correlationId`, see
// docs/audit-platform-architecture.md section "Trace integration"). The
// audit record keeps both so a reader can see exactly what was submitted
// AND how it was correlated, without one field having to serve both
// purposes.
//
// `timestamp` is when THIS audit record was created (audit-log
// convention: "when was this recorded"), not the original event's own
// `timestamp` field (already available via `eventId` cross-reference if
// the original DomainEvent is ever needed) -- in practice near-identical
// since the Event Bus is synchronous, but conceptually distinct.
//
// `version` is the audit record's OWN schema version (from
// registry/auditRegistry.js), independent of the event envelope's own
// `version` field (events/contracts/eventEnvelope.js) -- an audit
// record's shape can evolve on its own timeline.
//
// Every record is deep-frozen before it is ever returned to a caller --
// this is the platform's immutability guarantee (see
// docs/audit-platform-architecture.md section "Immutability guarantees"):
// never edited, never updated, never rewritten, never deleted.

import { deepFreeze } from '../shared/freezeDeep.js';
import { generateId } from '../shared/generateId.js';

/**
 * @typedef {object} AuditRecord
 * @property {string} auditId unique per audit record
 * @property {string} eventId the observed DomainEvent's own id
 * @property {string} eventType e.g. "PurchaseCreated"
 * @property {string} aggregate e.g. "purchase"
 * @property {*} aggregateId
 * @property {string} timestamp ISO-8601, when this audit record was created
 * @property {object} traceContext diagnostics' derived TraceContext for this event
 * @property {object} metadata the event's own, raw, publisher-supplied metadata
 * @property {object} payload the event's own payload, unchanged
 * @property {number} version this audit record's own schema version
 */

/**
 * @param {object} fields
 * @param {import('../../events/contracts/eventEnvelope.js').DomainEvent} fields.event
 * @param {object} fields.traceContext
 * @param {number} fields.auditRecordVersion
 * @returns {AuditRecord}
 */
export function createAuditRecord ({ event, traceContext, auditRecordVersion }) {
  if (!event || typeof event !== 'object') throw new TypeError('createAuditRecord: event is required');
  if (!traceContext || typeof traceContext !== 'object') throw new TypeError('createAuditRecord: traceContext is required');
  if (!Number.isInteger(auditRecordVersion) || auditRecordVersion < 1) {
    throw new TypeError('createAuditRecord: auditRecordVersion must be a positive integer');
  }

  return deepFreeze({
    auditId: generateId('audit'),
    eventId: event.id,
    eventType: event.type,
    aggregate: event.aggregate,
    aggregateId: event.aggregateId,
    timestamp: new Date().toISOString(),
    traceContext,
    metadata: event.metadata,
    payload: event.payload,
    version: auditRecordVersion
  });
}

const REQUIRED_FIELDS = [
  'auditId', 'eventId', 'eventType', 'aggregate', 'aggregateId',
  'timestamp', 'traceContext', 'metadata', 'payload', 'version'
];

/**
 * Structural contract check -- throws if `record` is missing any required
 * field. Used by tests and by any future store implementation that wants
 * to validate a record's shape before persisting it.
 * @param {AuditRecord} record
 */
export function assertValidAuditRecord (record) {
  if (!record || typeof record !== 'object') throw new TypeError('assertValidAuditRecord: record must be an object');
  for (const key of REQUIRED_FIELDS) {
    if (!(key in record)) throw new TypeError(`assertValidAuditRecord: missing "${key}"`);
  }
  return true;
}
