// shared/generateId.js
// Same id-generation primitive as every sibling platform's own
// shared/generateId.js (crypto.randomUUID, with a non-crypto fallback).
//
// Used here only for an in-memory journal-entry correlation handle when a
// caller does not supply one. This is NOT a persistence key: a future
// journal_entries table's own gen_random_uuid() primary key supersedes it,
// exactly the way every other platform's generated run/record id is
// superseded once something real stores it.
//
// Internal primitive -- deliberately NOT re-exported from index.js.

export function generateId (prefix = 'accounting') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
