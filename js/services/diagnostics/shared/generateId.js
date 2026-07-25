// shared/generateId.js
// Same id-generation primitive as events/contracts/eventEnvelope.js's own
// internal generateEventId() (crypto.randomUUID, with a non-crypto
// fallback for older browsers/test shells) -- kept as its own small copy
// rather than imported, since events/index.js does not export it (it is
// deliberately internal to that module). Used here only for diagnostics'
// own bookkeeping identifiers (e.g. a generated correlationId) -- never for
// anything that looks like real business data.

export function generateId (prefix = 'diag') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
