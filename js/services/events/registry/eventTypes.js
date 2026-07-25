// registry/eventTypes.js
// The single source of truth for every domain event type this application
// recognizes (Milestone 11A). No module should ever hardcode an event type
// string literal -- import the constant from here instead. Adding a new
// event type is always additive: add one entry to EVENT_CONTRACTS below
// (and export it from events/index.js); nothing else under events/ needs to
// change for a new event type to become publishable/subscribable.
//
// Naming convention (permanent -- see docs/milestone-11a-event-bus-design.md
// section "Event naming convention" for the full rationale):
//
//   - The JS constant identifier is SCREAMING_SNAKE_CASE, matching every
//     other enum-like constant already in this codebase (e.g.
//     EXECUTION_MODES, ENTITY_TYPES under js/services/dataExchange/).
//   - The event type's STRING VALUE -- what actually travels inside the
//     envelope and what subscribers compare against -- is PascalCase,
//     "<Aggregate><PastTenseFact>" (e.g. "PurchaseCreated"). This is the
//     domain-event half of the convention and must never be mixed with
//     camelCase/kebab-case/snake_case anywhere in this catalog.
//   - Event types describe FACTS that already happened, never commands:
//     "PurchaseCreated", never "CreatePurchase". A command belongs to
//     whatever function already performs the action (savePurchaseFromCart,
//     etc.) -- this bus is notification-only (see design doc section
//     "Important architectural decisions").

import { deepFreeze } from '../shared/freezeDeep.js';

/** Every domain aggregate a registered event type may belong to. */
export const AGGREGATES = deepFreeze([
  'customer', 'supplier', 'item', 'purchase', 'sale', 'manufacturing',
  'stock', 'company', 'backup', 'restore', 'dataExchange'
]);

// The initial catalog -- exactly the event definitions named in Milestone
// 11A's brief, plus one addition from Milestone 11B (RESTORE_COMPLETED,
// see below). Extending this list in a future milestone never requires
// touching bus.js, eventEnvelope.js, or eventContext.js.
const EVENT_CONTRACTS = {
  CUSTOMER_CREATED: { type: 'CustomerCreated', aggregate: 'customer', version: 1, description: 'A new customer record was created.' },
  SUPPLIER_CREATED: { type: 'SupplierCreated', aggregate: 'supplier', version: 1, description: 'A new supplier record was created.' },
  ITEM_CREATED: { type: 'ItemCreated', aggregate: 'item', version: 1, description: 'A new item record was created.' },
  PURCHASE_CREATED: { type: 'PurchaseCreated', aggregate: 'purchase', version: 1, description: 'A purchase was saved successfully.' },
  PURCHASE_DELETED: { type: 'PurchaseDeleted', aggregate: 'purchase', version: 1, description: 'A purchase was deleted.' },
  SALE_CREATED: { type: 'SaleCreated', aggregate: 'sale', version: 1, description: 'A sale was saved successfully.' },
  SALE_CANCELLED: { type: 'SaleCancelled', aggregate: 'sale', version: 1, description: 'A previously saved sale was cancelled.' },
  MANUFACTURING_STARTED: { type: 'ManufacturingStarted', aggregate: 'manufacturing', version: 1, description: 'A manufacturing run was started.' },
  MANUFACTURING_COMPLETED: { type: 'ManufacturingCompleted', aggregate: 'manufacturing', version: 1, description: 'A manufacturing run was completed.' },
  STOCK_ADJUSTED: { type: 'StockAdjusted', aggregate: 'stock', version: 1, description: 'Stock quantity for an item was adjusted.' },
  COMPANY_CHANGED: { type: 'CompanyChanged', aggregate: 'company', version: 1, description: 'The active company context changed.' },
  BACKUP_CREATED: { type: 'BackupCreated', aggregate: 'backup', version: 1, description: 'A native .apnabill backup was created.' },
  // Added in Milestone 11B: runApnaBillRestore() (New Company Restore) is a
  // genuine, complete, successful business operation with no matching event
  // in the 11A seed catalog -- documented as a registry gap in
  // docs/milestone-11b-event-integration-report.md section "Registry
  // addition" before being added here, per this milestone's own "document
  // the gap before creating a new event type" rule. Purely additive: one
  // new contract entry, no change to contracts/eventEnvelope.js or
  // bus/eventBus.js.
  RESTORE_COMPLETED: { type: 'RestoreCompleted', aggregate: 'restore', version: 1, description: 'A native .apnabill archive was restored into a company (New Company Restore).' },
  IMPORT_COMPLETED: { type: 'ImportCompleted', aggregate: 'dataExchange', version: 1, description: 'An import run (XML or JSON) completed.' },
  EXPORT_COMPLETED: { type: 'ExportCompleted', aggregate: 'dataExchange', version: 1, description: 'An export run (XML or JSON) completed.' }
};

for (const contract of Object.values(EVENT_CONTRACTS)) {
  if (!AGGREGATES.includes(contract.aggregate)) {
    throw new Error(`eventTypes: "${contract.type}" declares unknown aggregate "${contract.aggregate}"`);
  }
}

/** EVENT_TYPES.PURCHASE_CREATED === 'PurchaseCreated' -- import this, never the raw string. */
export const EVENT_TYPES = deepFreeze(
  Object.fromEntries(Object.entries(EVENT_CONTRACTS).map(([key, c]) => [key, c.type]))
);

const CONTRACTS_BY_TYPE = deepFreeze(
  Object.fromEntries(Object.values(EVENT_CONTRACTS).map((c) => [c.type, c]))
);

/**
 * @param {string} eventType
 * @returns {{type: string, aggregate: string, version: number, description: string}|null}
 */
export function getEventContract (eventType) {
  return CONTRACTS_BY_TYPE[eventType] || null;
}

/** @param {string} eventType */
export function isKnownEventType (eventType) {
  return Object.prototype.hasOwnProperty.call(CONTRACTS_BY_TYPE, eventType);
}

/** @returns {string[]} every registered event type's string value. */
export function listEventTypes () {
  return Object.keys(CONTRACTS_BY_TYPE);
}
