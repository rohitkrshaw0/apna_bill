// xml/mapping/parseHelpers.js
// Small, shared parsing quirks documented in docs/milestone-9b-xml-mapping.md
// section 6 -- used by more than one mapper, so they live here once instead
// of being duplicated per mapper.

// The literal &#4; control character Tally's exporter uses as a bullet
// marker on enum-like fields (GSTAPPLICABLE, etc.) -- strip before comparing.
// Built via RegExp(...) with escaped \u unicode sequences rather than a
// literal character class, so no raw control byte lives in this source file.
const CTRL_PREFIX_RE = new RegExp('^[\\u0000-\\u001F]+\\s*');

export function stripControlPrefix (text) {
  return typeof text === 'string' ? text.replace(CTRL_PREFIX_RE, '').trim() : text;
}

/** "<number> <unit>" (e.g. " 1 Pcs") -> { value, unit }. value is null if unparseable. */
export function splitNumberSpaceUnit (text) {
  if (typeof text !== 'string') return { value: null, unit: null };
  const m = /^(-?[\d.]+)\s*(\S*)$/.exec(text.trim());
  if (!m) return { value: null, unit: null };
  const value = Number(m[1]);
  return { value: Number.isFinite(value) ? value : null, unit: m[2] || null };
}

/** "<number>/<unit>" (e.g. "1500/Pcs") -> { value, unit }. value is null if unparseable. */
export function splitNumberSlashUnit (text) {
  if (typeof text !== 'string') return { value: null, unit: null };
  const parts = text.trim().split('/');
  const value = Number(parts[0]);
  return { value: Number.isFinite(value) && parts[0] !== '' ? value : null, unit: parts[1] || null };
}

/** Trims a numeric text node (several fields carry a leading-space formatting artifact). */
export function parseTrimmedNumber (text) {
  if (text == null) return 0;
  const n = Number(String(text).trim());
  return Number.isFinite(n) ? n : 0;
}

/** "YYYYMMDD" -> "YYYY-MM-DD", or null if not exactly 8 digits. */
export function parseTallyDate (text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!/^\d{8}$/.test(trimmed)) return null;
  return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
}
