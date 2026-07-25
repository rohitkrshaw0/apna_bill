// services/audit/index.js
// Public barrel for the Audit Platform (Milestone 11E). Depends only on
// events/ and diagnostics/ (their public barrels) -- nothing under
// jobs/, dataExchange/, or any business file is imported anywhere in this
// platform (confirmed by grep), and no business file imports FROM this
// platform either: unlike the Job Engine (11D), this milestone's brief
// gave no instruction to wire live startup into real pages, so
// `auditSubscriber` below is constructed but never started anywhere in
// this codebase -- the same deliberate "build but don't start" precedent
// Diagnostics' own observer (11C) established. See
// docs/milestone-11e-audit-platform-design.md section "Deliberately not
// started anywhere" for the full reasoning.
//
// Importing this module has NO side effects -- nothing subscribes to the
// Event Bus until some future caller explicitly calls
// `auditSubscriber.start()`.

import { createAuditSubscriber } from './subscriber/auditSubscriber.js';

export { isAuditedEventType, getAuditRecordVersion, listAuditedEventTypes } from './registry/auditRegistry.js';
export { createAuditRecord, assertValidAuditRecord } from './contracts/auditRecord.js';
export { assertValidAuditStore, createInMemoryAuditStore } from './store/auditStore.js';
export { createAuditQueryApi } from './query/auditQueryApi.js';
export { createAuditSubscriber } from './subscriber/auditSubscriber.js';

/** The application-wide Audit Subscriber instance. Constructed, not started -- call .start() to begin auditing. */
export const auditSubscriber = createAuditSubscriber();
