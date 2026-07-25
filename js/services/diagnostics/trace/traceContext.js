// trace/traceContext.js
// A reusable Trace Context (Milestone 11C section "Trace Context"). Every
// field is optional -- callers get back only what was actually supplied,
// nothing fabricated. Seven of the eight fields the brief lists already
// exist, verbatim, as events/context/eventContext.js's own whitelist
// (user/company/requestId/source/module/executionId/traceId) -- this
// module deliberately does NOT redeclare or duplicate that whitelist by
// importing events/'s context helper directly (see deriveTraceContextFromEvent
// below); it only adds the one genuinely new field the Event Bus's context
// doesn't carry: `correlationId`.
//
// `correlationId` is not "invented business data" the way a fake user id
// would be -- it is diagnostics' own bookkeeping identifier for correlating
// several observations that belong to one logical operation, generated the
// same way events/contracts/eventEnvelope.js generates its own `id` field
// (crypto.randomUUID). A caller that already has a real correlation id
// (e.g. from an HTTP header, once this app has one) can always supply it
// explicitly instead -- it is only generated when absent.

import { generateId } from '../shared/generateId.js';

const TRACE_KEYS = ['traceId', 'requestId', 'executionId', 'correlationId', 'company', 'module', 'user', 'source'];

/**
 * @typedef {object} TraceContext
 * @property {string} [traceId]
 * @property {string} [requestId]
 * @property {string} [executionId]
 * @property {string} correlationId always present -- generated if not supplied
 * @property {*} [company]
 * @property {string} [module]
 * @property {*} [user]
 * @property {string} [source]
 */

/**
 * @param {object} [overrides] any of TRACE_KEYS
 * @returns {TraceContext}
 */
export function createTraceContext (overrides = {}) {
  const trace = {};
  for (const key of TRACE_KEYS) {
    if (overrides[key] !== undefined) trace[key] = overrides[key];
  }
  if (trace.correlationId === undefined) trace.correlationId = generateId('corr');
  return trace;
}

/**
 * Builds a TraceContext from an already-published DomainEvent, so trace
 * identifiers "flow naturally through the existing Event Context" (the
 * brief's own wording) rather than diagnostics maintaining a second,
 * parallel context system. Only copies fields the event's metadata
 * actually carries -- most events will only have some of them, since
 * publishers only set what they genuinely have in scope (see
 * docs/milestone-11b-event-integration-report.md section "Payload
 * philosophy").
 * @param {import('../../events/contracts/eventEnvelope.js').DomainEvent} event
 * @returns {TraceContext}
 */
export function deriveTraceContextFromEvent (event) {
  return createTraceContext({ ...(event?.metadata || {}) });
}
