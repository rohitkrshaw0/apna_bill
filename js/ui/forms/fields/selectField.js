// A dropdown / <select> field — firm selector, adjustment reason, and any
// other fixed-choice input.
//
// `options` is an array of either plain strings (used as both the value
// and the display label) or `{ value, label }` objects, so the common
// case stays a one-line array while a display label can still differ
// from the underlying value when needed.
import { renderField } from '../core/renderField.js';
import { escapeHtml } from '../../escape.js';
import { idSelector } from '../core/idSelector.js';
import { buildControlAttrs } from '../core/buildControlAttrs.js';

export function selectField ({
  id, label, value = '', options = [],
  required = false, disabled = false,
  helpText = '', error = '', className = '', onChange
} = {}) {
  const optionsHtml = options.map(option => {
    const optionValue = typeof option === 'string' ? option : option.value;
    const optionLabel = typeof option === 'string' ? option : option.label;
    const isSelected = optionValue === value;
    return `<option value="${escapeHtml(optionValue)}" ${isSelected ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`;
  }).join('');

  // Native <select> has no `readonly` attribute (only `disabled`), so this
  // field deliberately doesn't accept one — that would be an option the
  // control can't actually honor.
  const control = `
    <select
      ${buildControlAttrs({ id, required, disabled })}
    >${optionsHtml}</select>`;

  const html = renderField({ id, label, required, className, helpText, error, control });

  function mount (root = document) {
    if (!onChange) return;
    const select = root.querySelector(idSelector(id));
    if (select) select.addEventListener('change', () => onChange(select.value));
  }

  return { html, mount };
}
