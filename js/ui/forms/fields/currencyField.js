// A currency input — retail/wholesale/purchase price, amount received,
// and any other rupee amount. Kept separate from numberField because
// money always uses `inputmode="decimal"` (brings up the right mobile
// keypad) and a fixed `step="0.01"` (paise) — a distinct, fixed
// convention rather than a per-call option.
import { renderField } from '../core/renderField.js';
import { escapeHtml } from '../../escape.js';
import { idSelector } from '../core/idSelector.js';
import { buildControlAttrs } from '../core/buildControlAttrs.js';

export function currencyField ({
  id, label, value = 0, placeholder = '', min = 0,
  required = false, disabled = false, readonly = false,
  helpText = '', error = '', className = '', onChange
} = {}) {
  const control = `
    <input
      ${buildControlAttrs({ id, required, disabled, readonly })}
      type="number"
      inputmode="decimal"
      value="${value}"
      placeholder="${escapeHtml(placeholder)}"
      step="0.01"
      min="${min}"
    >`;

  const html = renderField({ id, label, required, className, helpText, error, control });

  function mount (root = document) {
    if (!onChange) return;
    const input = root.querySelector(idSelector(id));
    if (input) input.addEventListener('input', () => onChange(input.valueAsNumber));
  }

  return { html, mount };
}
