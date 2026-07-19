// Renders a form field's label text, including the required-field marker.
//
// This is the ONLY place in the whole Form Framework that decides how a
// required field is marked. Pages never type a literal "*" into a label
// again — they pass `required: true` to a field factory, and the factory
// (via core/renderField.js) calls this function. If the required-marker's
// look ever needs to change (color, symbol, wording, position), this is
// the one file to edit — every field across every page updates together.

export function renderFieldLabel ({ label, required = false } = {}) {
  const requiredMarker = required ? '<span class="field-required">*</span>' : '';
  return `<span class="field-label">${label}${requiredMarker}</span>`;
}
