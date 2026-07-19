// LineItemRow — a generic, reusable "one editable line-item row" business
// component, built on top of the Form Framework's own field factories.
// Not tied to any one page or business concept: it doesn't know it's
// rendering a sale, a purchase, or a manufacturing consumption row — it
// just arranges a row-key-scoped group of fields inside the shell markup
// already shared byte-for-byte by sale.html/purchase.html/
// manufacturing.html's hand-written cart rows.
//
// This file owns UI composition and field wiring ONLY:
//   - laying out the row's shell (numbering, name, an optional badge,
//     the editable fields, an optional secondary field block, a total
//     display slot, a remove button)
//   - giving every field in the row a real, unique DOM id (namespaced by
//     `rowKey`, so N rows never collide) and mounting them
//   - calling `onRemove()` when the remove button is clicked
//
// It does NOT own: what the fields mean, how a total is computed, what
// counts as valid, or how removal is persisted. `lineTotalHtml` is a
// caller-computed string dropped into a `data-role="line-total"` slot —
// updating it later (e.g. after a keystroke changes the total) is the
// caller's own direct DOM update, exactly like the hand-written code it
// replaces already does; this component has no recompute logic of its
// own. `onRemove` is a bare callback — whether "remove" means filtering
// an array, calling an API, or something else is entirely up to the
// caller.
//
// `fields`/`subFields` are arrays of `{ factory, options }`, where
// `factory` is any Form Framework field factory (numberField,
// currencyField, quickPickNumberField, textField, ...) and
// `options.id` is the row-LOCAL logical name (e.g. 'qty') — this
// component derives the real id as `${rowKey}-${options.id}` internally,
// which is the only thing that's made repeating rows workable at all.
import { escapeHtml } from '../../escape.js';

function buildNamespacedField (rowKey, { factory, options }) {
  return factory({ ...options, id: `${rowKey}-${options.id}` });
}

export function lineItemRow ({
  rowKey, index, name, badgeHtml = '',
  fields = [], subFields, lineTotalHtml = '', onRemove
} = {}) {
  const namespacedFields = fields.map(def => buildNamespacedField(rowKey, def));
  const namespacedSubFields = subFields ? subFields.map(def => buildNamespacedField(rowKey, def)) : null;

  const fieldsHtml = namespacedFields.map(f => f.html).join('');
  const subFieldsHtml = namespacedSubFields
    ? `<div class="batch-fields">${namespacedSubFields.map(f => f.html).join('')}</div>`
    : '';

  const html = `
    <li class="cart-line" data-row-key="${escapeHtml(rowKey)}">
      <div class="lineno">${String(index + 1).padStart(2, '0')}</div>
      <div class="line-main">
        <div class="line-name">
          <span class="name-plain">${escapeHtml(name)}</span>
          ${badgeHtml}
        </div>
        <div class="line-controls">${fieldsHtml}</div>
        ${subFieldsHtml}
      </div>
      <div class="line-side">
        <div class="line-total" data-role="line-total">${lineTotalHtml}</div>
        <button class="line-remove" data-remove>Remove</button>
      </div>
    </li>
  `;

  // `root` may be the row's own <li> (if the caller mounts each row
  // individually) or an ancestor containing it (if the caller renders N
  // rows' HTML at once and mounts them all against the shared list
  // container, the same way renderFieldsInto works) — this handles both.
  function mount (root = document) {
    const selector = `[data-row-key="${CSS.escape(rowKey)}"]`;
    const rowEl = root.matches?.(selector) ? root : root.querySelector(selector);
    if (!rowEl) return;

    namespacedFields.forEach(f => f.mount(rowEl));
    if (namespacedSubFields) namespacedSubFields.forEach(f => f.mount(rowEl));

    const removeBtn = rowEl.querySelector('[data-remove]');
    if (removeBtn && onRemove) removeBtn.addEventListener('click', onRemove);
  }

  return { html, mount };
}
