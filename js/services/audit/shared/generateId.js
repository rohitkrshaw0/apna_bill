// shared/generateId.js
// Same id-generation primitive as events/, diagnostics/, and jobs/'s own
// copies (crypto.randomUUID, with a non-crypto fallback). Used here only
// for the audit record's own `auditId` -- never for anything that looks
// like real business data.

export function generateId (prefix = 'audit') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
