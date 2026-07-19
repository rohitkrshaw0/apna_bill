// A checkbox toggle — "Track stock", "Track batches", "Prices are
// tax-inclusive", and similar on/off settings.
//
// `value` holds the boolean checked-state. This is the same option name
// every other field in the framework uses for "the field's current
// value" (a string for textField, a number for numberField/
// currencyField, a boolean here) — so switching a field from, say,
// textField to checkboxField means changing the field type and what you
// pass for `value`, not learning a new option name.
//
// Checkboxes are laid out differently from every other field: the
// control comes BEFORE its label text, on one row, matching the
// `.chk-row` convention already used across the app (see
// css/shared.css:307-308). That's what core/renderField.js's `layout:
// 'control-first'` option exists for — this field renders through the
// exact same shared composition as every other field, just with the
// control and label swapped, so there remains exactly one place
// (renderField.js/fieldWrapper.js) that knows how a field's pieces fit
// together.
import { renderField } from '../core/renderField.js';
import { idSelector } from '../core/idSelector.js';
import { buildControlAttrs } from '../core/buildControlAttrs.js';

export function checkboxField ({
  id, label, value = false,
  required = false, disabled = false,
  helpText = '', error = '', className = '', onChange
} = {}) {
  // No `readonly` option: a native checkbox has no readonly attribute —
  // the browser still lets a user toggle it — so there is no honest way
  // to support one. (selectField.js drops the same option for the same
  // reason, for `<select>`.)
  const control = `
    <input
      ${buildControlAttrs({ id, required, disabled })}
      type="checkbox"
      ${value ? 'checked' : ''}
    >`;

  const wrapperClassName = className ? `chk-row ${className}` : 'chk-row';
  const html = renderField({
    id, label, required, helpText, error, control,
    className: wrapperClassName,
    layout: 'control-first'
  });

  function mount (root = document) {
    if (!onChange) return;
    const input = root.querySelector(idSelector(id));
    if (input) input.addEventListener('change', () => onChange(input.checked));
  }

  return { html, mount };
}
