// A multi-line text input — party address and any other free-text field
// that needs more than one line.
import { renderField } from '../core/renderField.js';
import { escapeHtml } from '../../escape.js';
import { idSelector } from '../core/idSelector.js';
import { buildControlAttrs } from '../core/buildControlAttrs.js';

export function textareaField ({
  id, label, value = '', placeholder = '', rows = 3,
  required = false, disabled = false, readonly = false,
  helpText = '', error = '', className = '', onChange
} = {}) {
  const control = `
    <textarea
      ${buildControlAttrs({ id, required, disabled, readonly })}
      rows="${rows}"
      placeholder="${escapeHtml(placeholder)}"
    >${escapeHtml(value)}</textarea>`;

  const html = renderField({ id, label, required, className, helpText, error, control });

  function mount (root = document) {
    if (!onChange) return;
    const textarea = root.querySelector(idSelector(id));
    if (textarea) textarea.addEventListener('input', () => onChange(textarea.value));
  }

  return { html, mount };
}
