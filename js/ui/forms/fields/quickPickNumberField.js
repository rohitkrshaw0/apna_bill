// A number field paired with a row of quick-pick chips — click a chip to
// fill the field with that value instead of typing it. Built as one
// generic component, not hardcoded to GST, so the same control can back
// GST rate, discount %, margin %, commission %, service charge %, or any
// other "pick a common value, or type your own" percentage field. See
// gstRateField.js for the GST-specific configuration of this component.
//
// `picks` and `suffix` are this field's two field-specific extras: the
// list of values offered as chips (e.g. [0, 5, 12, 18, 28]) and the text
// appended after each one (defaults to '%', since every field this
// component was designed for is a percentage). Every other option name
// matches every other field in the framework.
import { renderField } from '../core/renderField.js';
import { idSelector } from '../core/idSelector.js';
import { buildControlAttrs } from '../core/buildControlAttrs.js';

export function quickPickNumberField ({
  id, label, value = 0, picks = [], suffix = '%',
  required = false, disabled = false, readonly = false,
  helpText = '', error = '', className = '', onChange
} = {}) {
  const chipsRootId = `${id}-quick`;

  const chipsHtml = picks.map(pick => {
    const isActive = pick === value;
    return `<button type="button" data-pick="${pick}" class="${isActive ? 'active' : ''}">${pick}${suffix}</button>`;
  }).join('');

  const control = `
    <input
      ${buildControlAttrs({ id, required, disabled, readonly })}
      type="number"
      value="${value}"
      step="any"
      min="0"
    >
    <div class="quick-pick-chips" id="${chipsRootId}">${chipsHtml}</div>
  `;

  const html = renderField({ id, label, required, className, helpText, error, control });

  // Wires two things: clicking a chip fills the number field and marks
  // that chip active; typing a value into the number field that matches
  // one of the chips marks it active too (and typing anything else clears
  // whichever chip was active) — matching items.html's existing GST-field
  // behavior exactly, not just the click-to-fill half of it.
  function mount (root = document) {
    const input = root.querySelector(idSelector(id));
    const chipsRoot = root.querySelector(idSelector(chipsRootId));
    if (!input || !chipsRoot) return;

    const chips = chipsRoot.querySelectorAll('button');
    const syncActiveChip = () => {
      chips.forEach(chip => chip.classList.toggle('active', chip.dataset.pick === input.value));
    };

    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.pick;
        syncActiveChip();
        if (onChange) onChange(input.valueAsNumber);
      });
    });

    input.addEventListener('input', () => {
      syncActiveChip();
      if (onChange) onChange(input.valueAsNumber);
    });
  }

  return { html, mount };
}
