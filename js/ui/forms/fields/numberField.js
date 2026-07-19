// A generic numeric input — for plain numbers that aren't money or a
// percentage, which have their own dedicated fields (currencyField,
// quickPickNumberField) with their own conventions. Used e.g. for
// "Low stock alert below" and "Cess % (if any)", and — with
// `inputmode: 'decimal'` — for cart-line quantities/rates, which need
// the mobile decimal keypad but not currencyField's fixed step="0.01"
// (wrong for a quantity) or a whole separate field type of their own.
//
// `min` defaults to 0, same as always — every existing call site that
// doesn't pass `min` is unaffected. Pass `min: null` to omit the
// attribute entirely for a field that must accept negative values (e.g.
// a +/- stock adjustment) — `null` is the one value JS's own default-
// parameter mechanism won't quietly turn back into 0, which is why it's
// the sentinel here rather than `undefined` (indistinguishable from
// "omitted" by design in JS, so it can't mean anything different).
import { renderField } from '../core/renderField.js';
import { escapeHtml } from '../../escape.js';
import { idSelector } from '../core/idSelector.js';
import { buildControlAttrs } from '../core/buildControlAttrs.js';

export function numberField ({
  id, label, value = 0, placeholder = '', min = 0, max, step = 'any', inputmode = '',
  required = false, disabled = false, readonly = false,
  helpText = '', error = '', className = '', onChange
} = {}) {
  const control = `
    <input
      ${buildControlAttrs({ id, required, disabled, readonly })}
      type="number"
      value="${value}"
      placeholder="${escapeHtml(placeholder)}"
      step="${step}"
      ${min !== null ? `min="${min}"` : ''}
      ${max !== undefined ? `max="${max}"` : ''}
      ${inputmode ? `inputmode="${inputmode}"` : ''}
    >`;

  const html = renderField({ id, label, required, className, helpText, error, control });

  function mount (root = document) {
    if (!onChange) return;
    const input = root.querySelector(idSelector(id));
    if (input) input.addEventListener('input', () => onChange(input.valueAsNumber));
  }

  return { html, mount };
}
