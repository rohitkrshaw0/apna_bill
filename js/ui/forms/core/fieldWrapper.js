// Assembles the outer <label class="field"> shell that every field in the
// Form Framework is rendered inside. This is pure composition: it takes
// already-rendered pieces (the label markup, the control markup, help
// text, the error slot markup) and arranges them in one of two fixed
// orders, the same for every field on every page:
//
//   layout: 'label-first' (default)     layout: 'control-first'
//   <label class="field ...">           <label class="field ...">
//     <span class="field-label">...       ...the field's own control...
//     ...the field's own control...       <span class="field-label">...
//     <small class="field-help">...       <small class="field-help">...
//     <span class="field-error" ...       <span class="field-error" ...
//   </label>                            </label>
//
// 'control-first' exists for checkboxField, whose control needs to read
// before its label text on one row (see checkboxField.js) — before this
// option existed, checkboxField built its own separate copy of this exact
// composition just to get the opposite order, which meant two places knew
// how a field's pieces fit together instead of one.
//
// This file has no opinion on *what* a required marker looks like or *how*
// an error is styled — those decisions belong to fieldLabel.js and
// fieldError.js respectively. Keeping this file to layout-only composition
// is what lets those concerns change independently of each other.
//
// `className` is appended alongside the framework's own "field" class so
// pages can attach layout hints such as "full" — the existing
// `.form-grid .full` rule in css/shared.css already spans a grid cell full
// width, and continues to work unchanged on this element.
// `.form-grid label { … }` (also in css/shared.css) already styles any
// <label> nested inside a `.form-grid`, so this wrapper needs no field-grid
// styling of its own — it only ever adds the three new rules that are
// specific to the framework: `.field-label .field-required`, `.field-help`, and
// `.field-error`.

export function renderFieldWrapper ({ className = '', labelHtml, controlHtml, helpText = '', errorHtml, layout = 'label-first' } = {}) {
  const fieldClass = className ? `field ${className}` : 'field';
  const helpHtml = helpText ? `<small class="field-help">${helpText}</small>` : '';
  const bodyHtml = layout === 'control-first'
    ? `${controlHtml}${labelHtml}`
    : `${labelHtml}${controlHtml}`;
  return `
    <label class="${fieldClass}">
      ${bodyHtml}
      ${helpHtml}
      ${errorHtml}
    </label>
  `;
}
