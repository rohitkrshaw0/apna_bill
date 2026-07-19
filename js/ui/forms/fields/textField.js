// A single-line text input — the most common form control in the app:
// item name, code/SKU, unit, HSN/SAC, party name, phone, etc.
//
// Renders through core/renderField.js so its label, required marker, help
// text and error slot are identical to every other field in the
// framework. This file is responsible only for the <input> control itself
// and the JS that reads its value / wires its onChange.
//
// `leading` and `trailing` are optional raw HTML strings rendered just
// inside the input, on either side of it — for a generate/scan/search
// button, a password-visibility toggle, a currency prefix, a verification
// button, or similar inline actions. The caller owns whatever markup it
// passes in (ids, click behavior) and wires it up itself after the field
// is mounted, the same way it would wire up any other button on the page
// — this field only renders the slot and lays it out next to the input.
// When neither is given, textField renders exactly the plain <input> it
// always has, with no extra wrapping element.
//
// `type` (default 'text') covers every single-line, text-shaped native
// input type — 'email', 'password', 'date', 'tel', 'url', etc. all behave
// the same way from this field's point of view (a string `.value`, the
// same escaping, the same `input` event) and don't need their own field
// files just to change one attribute. `autocomplete` (default '', omitted
// when empty) exists for the one case a hint like "current-password"
// actually matters. `maxLength` (default '', omitted when empty) is a
// real, native validation constraint (e.g. a 2-digit state code) — not
// cosmetic — so it's a first-class option here rather than something a
// page has to bolt on after the fact.
import { renderField } from '../core/renderField.js';
import { escapeHtml } from '../../escape.js';
import { idSelector } from '../core/idSelector.js';
import { buildControlAttrs } from '../core/buildControlAttrs.js';

export function textField ({
  id, label, value = '', placeholder = '', list = '', type = 'text', autocomplete = '', maxLength = '',
  required = false, disabled = false, readonly = false,
  helpText = '', error = '', className = '', onChange,
  leading = '', trailing = ''
} = {}) {
  const inputHtml = `
    <input
      ${buildControlAttrs({ id, required, disabled, readonly })}
      type="${type}"
      value="${escapeHtml(value)}"
      placeholder="${escapeHtml(placeholder)}"
      ${list ? `list="${list}"` : ''}
      ${autocomplete ? `autocomplete="${autocomplete}"` : ''}
      ${maxLength ? `maxlength="${maxLength}"` : ''}
    >`;

  const control = (leading || trailing)
    ? `<div class="field-control-row">${leading}${inputHtml}${trailing}</div>`
    : inputHtml;

  const html = renderField({ id, label, required, className, helpText, error, control });

  // Only attaches a listener when the caller actually wants live updates —
  // most pages today read `input.value` once at submit time and don't
  // need this at all.
  function mount (root = document) {
    if (!onChange) return;
    const input = root.querySelector(idSelector(id));
    if (input) input.addEventListener('input', () => onChange(input.value));
  }

  return { html, mount };
}
