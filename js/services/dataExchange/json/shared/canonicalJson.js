// json/shared/canonicalJson.js
// The primitive, zero-business-knowledge layer for this format engine --
// mirrors tallyXmlWriter.js's role relative to tallyXmlFormatterV1.js
// exactly: this file knows nothing about items/customers/sales, only how to
// turn a plain JS value into deterministic JSON text.
//
// canonicalize() recursively sorts every plain object's own keys
// alphabetically (arrays keep their existing element order untouched --
// record ordering is a data-reader concern, see milestone-10-json-design.md
// section 6, item 1) so JSON.stringify's output depends only on the VALUE
// being serialized, never on the incidental key-insertion order a DTO
// factory or an open-ended meta/values bag happened to produce it in.

function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function canonicalize (value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

/** @param {any} value @param {object} [opts] { pretty } @returns {string} */
export function canonicalStringify (value, { pretty = false } = {}) {
  return JSON.stringify(canonicalize(value), null, pretty ? 2 : undefined);
}
