// shared/generateId.js
// Same id-generation primitive as every sibling platform's own
// shared/generateId.js (crypto.randomUUID, with a non-crypto fallback).
// Used here for report-run bookkeeping ids -- never for anything that
// looks like real business data.

export function generateId (prefix = 'report') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
