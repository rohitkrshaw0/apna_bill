// shared/generateId.js
// Same id-generation primitive as events/contracts/eventEnvelope.js's and
// diagnostics/shared/generateId.js's own (crypto.randomUUID, with a
// non-crypto fallback). Used here only for job-run bookkeeping ids
// (jobRunId) -- never for anything that looks like real business data.

export function generateId (prefix = 'job') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
