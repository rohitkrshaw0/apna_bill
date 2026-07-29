// registry/auditRegistry.js
// Central registry of every audit record type (Milestone 11E section
// "Audit Registry"). Every domain event type EVENT_TYPES currently
// declares (events/registry/eventTypes.js) has one entry here -- the
// registry's job is not to gate WHICH events are business-meaningful
// (that is already events/registry/eventTypes.js's job) but to be the
// single source of truth for the audit RECORD's own schema version per
// event type, independent of the event envelope's own `version` field
// (an audit record's shape can evolve on its own timeline, separate from
// the event contract it observes).
//
// "Avoid string literals": no file under audit/ ever compares
// `event.type === 'SomeString'` -- every check goes through
// isAuditedEventType()/getAuditRecordVersion() below, and every entry in
// AUDIT_RECORD_VERSIONS is keyed by an EVENT_TYPES.* constant, never a
// hand-typed string.
//
// Deliberate design point: a FUTURE event type is NOT audited until it is
// explicitly added here. This is not an oversight -- an audit trail that
// silently starts covering new event types the moment they're published,
// with no deliberate decision to include them, is a weaker guarantee than
// one where every audited type was consciously opted in. The subscriber
// (subscriber/auditSubscriber.js) handles an unregistered event type
// gracefully (logs a warning, creates no record, never throws) rather
// than crashing -- see that file's own header comment.

import { EVENT_TYPES } from '../../events/index.js';
import { deepFreeze } from '../shared/freezeDeep.js';

const AUDIT_RECORD_VERSIONS = deepFreeze({
  [EVENT_TYPES.CUSTOMER_CREATED]: 1,
  [EVENT_TYPES.SUPPLIER_CREATED]: 1,
  [EVENT_TYPES.ITEM_CREATED]: 1,
  [EVENT_TYPES.PURCHASE_CREATED]: 1,
  [EVENT_TYPES.PURCHASE_DELETED]: 1,
  [EVENT_TYPES.SALE_CREATED]: 1,
  [EVENT_TYPES.SALE_CANCELLED]: 1,
  [EVENT_TYPES.MANUFACTURING_STARTED]: 1,
  [EVENT_TYPES.MANUFACTURING_COMPLETED]: 1,
  [EVENT_TYPES.STOCK_ADJUSTED]: 1,
  [EVENT_TYPES.COMPANY_CHANGED]: 1,
  [EVENT_TYPES.BACKUP_CREATED]: 1,
  [EVENT_TYPES.RESTORE_COMPLETED]: 1,
  [EVENT_TYPES.IMPORT_COMPLETED]: 1,
  [EVENT_TYPES.EXPORT_COMPLETED]: 1,
  // Milestone 12A (Inventory Intelligence Platform) -- see that event
  // type's own comment in events/registry/eventTypes.js for why it exists.
  [EVENT_TYPES.INVENTORY_INSIGHT_GENERATED]: 1,
  // Milestone 12B (Purchase Intelligence Platform) -- same reasoning.
  [EVENT_TYPES.PURCHASE_INSIGHT_GENERATED]: 1,
  // Milestone 12C (Sales Intelligence Platform) -- same reasoning.
  [EVENT_TYPES.SALES_INSIGHT_GENERATED]: 1,
  // Milestone 12D (Pricing Intelligence Platform) -- same reasoning.
  [EVENT_TYPES.PRICING_INSIGHT_GENERATED]: 1,
  // Milestone 12E (Supplier Intelligence Platform) -- same reasoning.
  [EVENT_TYPES.SUPPLIER_INSIGHT_GENERATED]: 1,
  // Milestone 12F (Business Dashboard Platform) -- same reasoning.
  [EVENT_TYPES.DASHBOARD_GENERATED]: 1
});

/** @param {string} eventType @returns {boolean} */
export function isAuditedEventType (eventType) {
  return Object.prototype.hasOwnProperty.call(AUDIT_RECORD_VERSIONS, eventType);
}

/** @param {string} eventType @returns {number|null} the audit record schema version for this event type, or null if unregistered */
export function getAuditRecordVersion (eventType) {
  return AUDIT_RECORD_VERSIONS[eventType] ?? null;
}

/** @returns {string[]} every event type this registry currently audits */
export function listAuditedEventTypes () {
  return Object.keys(AUDIT_RECORD_VERSIONS);
}
