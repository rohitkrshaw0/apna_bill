// context/eventContext.js
// Optional event metadata (Milestone 11A design doc section "Event
// context"). Every field here is OPTIONAL -- a caller can publish an event
// with zero context and still get a fully valid envelope; nothing forces
// every publish() call to know about user/company/requestId/etc. Only the
// keys listed in CONTEXT_KEYS are ever copied through, so `metadata` never
// becomes an unbounded grab-bag of arbitrary caller data.

const CONTEXT_KEYS = ['user', 'company', 'requestId', 'source', 'module', 'executionId', 'traceId'];

/**
 * @param {{user?: *, company?: *, requestId?: string, source?: string, module?: string, executionId?: string, traceId?: string}} [overrides]
 * @returns {object} only the recognized, explicitly-provided keys.
 */
export function createEventContext (overrides = {}) {
  const context = {};
  for (const key of CONTEXT_KEYS) {
    if (overrides[key] !== undefined) context[key] = overrides[key];
  }
  return context;
}
