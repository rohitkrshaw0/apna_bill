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
  'stock', 'company', 'backup', 'restore', 'dataExchange', 'inventoryInsight',
  'purchaseInsight', 'salesInsight', 'pricingInsight', 'supplierInsight', 'dashboard',
  'accounting'
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
  EXPORT_COMPLETED: { type: 'ExportCompleted', aggregate: 'dataExchange', version: 1, description: 'An export run (XML or JSON) completed.' },
  // Added in Milestone 12A (Inventory Intelligence Platform): the Business
  // Intelligence layer is read-only and does not audit every query (see
  // docs/architecture/business-intelligence.md) -- but an on-demand report,
  // a dashboard export, or a scheduled BI job run IS a business fact worth
  // recording, per that milestone's own brief ("Audit only: Generated
  // reports, Dashboard exports, Scheduled BI jobs"). One new contract entry,
  // exactly the sanctioned additive pattern this file's own header comment
  // describes -- no change to bus/eventBus.js, contracts/eventEnvelope.js,
  // or context/eventContext.js.
  INVENTORY_INSIGHT_GENERATED: { type: 'InventoryInsightGenerated', aggregate: 'inventoryInsight', version: 1, description: 'A Business Intelligence inventory insight report was generated (on-demand report, dashboard export, or scheduled BI job run).' },
  // Added in Milestone 12B (Purchase Intelligence Platform): the same
  // additive pattern INVENTORY_INSIGHT_GENERATED established in 12A --
  // Business Intelligence is read-only and does not audit every query, but
  // a generated purchase report, export, or scheduled job run is a
  // business fact worth recording. One new contract entry; no change to
  // bus/eventBus.js, contracts/eventEnvelope.js, or context/eventContext.js.
  PURCHASE_INSIGHT_GENERATED: { type: 'PurchaseInsightGenerated', aggregate: 'purchaseInsight', version: 1, description: 'A Business Intelligence purchase insight report was generated (on-demand report, dashboard export, or scheduled BI job run).' },
  // Added in Milestone 12C (Sales Intelligence Platform): the same additive
  // pattern INVENTORY_INSIGHT_GENERATED/PURCHASE_INSIGHT_GENERATED established.
  SALES_INSIGHT_GENERATED: { type: 'SalesInsightGenerated', aggregate: 'salesInsight', version: 1, description: 'A Business Intelligence sales insight report was generated (on-demand report, dashboard export, or scheduled BI job run).' },
  // Added in Milestone 12D (Pricing Intelligence Platform): the same
  // additive pattern INVENTORY_INSIGHT_GENERATED/PURCHASE_INSIGHT_GENERATED/
  // SALES_INSIGHT_GENERATED established.
  PRICING_INSIGHT_GENERATED: { type: 'PricingInsightGenerated', aggregate: 'pricingInsight', version: 1, description: 'A Business Intelligence pricing insight report was generated (on-demand report, dashboard export, or scheduled BI job run).' },
  // Added in Milestone 12E (Supplier Intelligence Platform): the same
  // additive pattern INVENTORY_INSIGHT_GENERATED/PURCHASE_INSIGHT_GENERATED/
  // SALES_INSIGHT_GENERATED/PRICING_INSIGHT_GENERATED established.
  SUPPLIER_INSIGHT_GENERATED: { type: 'SupplierInsightGenerated', aggregate: 'supplierInsight', version: 1, description: 'A Business Intelligence supplier insight report was generated (on-demand report, dashboard export, or scheduled BI job run).' },
  // Added in Milestone 12F (Business Dashboard Platform): the same additive
  // pattern INVENTORY_INSIGHT_GENERATED/PURCHASE_INSIGHT_GENERATED/
  // SALES_INSIGHT_GENERATED/PRICING_INSIGHT_GENERATED/SUPPLIER_INSIGHT_GENERATED
  // established -- Dashboard reads are never audited, only a generated
  // dashboard report/export/scheduled generation is.
  DASHBOARD_GENERATED: { type: 'DashboardGenerated', aggregate: 'dashboard', version: 1, description: 'A Business Dashboard report was generated (on-demand report, export, or scheduled generation).' },
  // Added in Milestone 15A (Accounting Platform Foundation): contracts
  // only, per that milestone's own scope decision -- 15A is foundation
  // infrastructure with zero consumers and posts nothing, so none of these
  // five is published anywhere yet. They are declared here now, rather
  // than deferred to 15B, because an event type is part of this catalog's
  // own additive contract and a future posting/period-close operation
  // should never need to touch this file to become publishable -- the
  // same "declare the shape now, wire the call site later" precedent
  // reporting's own requiredCapability and the Job Engine's unused
  // CANCELLED state already established. Publication begins in Milestone
  // 15B, the first milestone in which a journal entry is actually posted
  // or a fiscal period is actually closed -- a genuine business fact, not
  // platform initialization. Registration-time events (an account or
  // posting provider being registered) are deliberately NOT here: they
  // are platform lifecycle, not business facts, the same reasoning that
  // kept Milestone 14A's Reporting Platform Foundation at zero event types.
  JOURNAL_ENTRY_POSTED: { type: 'JournalEntryPosted', aggregate: 'accounting', version: 1, description: 'A balanced journal entry was posted to the ledger.' },
  JOURNAL_ENTRY_REVERSED: { type: 'JournalEntryReversed', aggregate: 'accounting', version: 1, description: 'A previously posted journal entry was reversed.' },
  FISCAL_PERIOD_CLOSED: { type: 'FiscalPeriodClosed', aggregate: 'accounting', version: 1, description: 'A fiscal period was closed to new postings.' },
  FISCAL_PERIOD_REOPENED: { type: 'FiscalPeriodReopened', aggregate: 'accounting', version: 1, description: 'A closed fiscal period was reopened for postings.' },
  FISCAL_PERIOD_LOCKED: { type: 'FiscalPeriodLocked', aggregate: 'accounting', version: 1, description: 'A fiscal period was locked, terminally, against further postings or reopening.' }
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
