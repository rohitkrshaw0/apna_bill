// Generic button factory + busy-state helper, closing the gap
// docs/milestone-8.5-migration.md's Gap report named ("no shared factory
// for a generic button ... a createButton() factory would absorb most,
// especially sheet-actions Cancel/Save pairs"). Emits the SAME classes
// css/shared.css already styles (.btn/.primary/.ghost/.danger) -- no new
// CSS, no new visual variant.

export function createButton ({ label, variant = 'ghost', type = 'button', id, className = '', onClick } = {}) {
  const btn = document.createElement('button');
  // Always explicit -- closes the type="submit"-by-default gap the audit
  // found in card.js/partyRow.js/batchRow.js/kebabMenu.js (createElement
  // defaults an unset type to "submit").
  btn.type = type;
  const classes = ['btn'];
  if (variant) classes.push(variant); // 'primary' | 'ghost' | 'danger'
  if (className) classes.push(className);
  btn.className = classes.join(' ');
  if (id) btn.id = id;
  btn.textContent = label;
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

// setButtonBusy() absorbs the disable-and-relabel pattern hand-copied 7x
// across the app (index.html, sale.html, purchase.html, manufacturing.html,
// items.html, suppliers.html, stock.html) -- including the one inconsistent
// copy (stock.html) that disabled the button but never changed its label.
// The original label is captured on first use and restored automatically,
// so a caller cannot repeat that omission.
const originalLabel = new WeakMap();

// Milestone 13B: some buttons (the sale/purchase/manufacturing save-bar
// `.save-btn`s) have internal structure --
// `<span>Save sale</span><span class="save-total">₹0.00</span>` -- where
// swapping the WHOLE button's textContent would destroy the total span.
// Marking that button's swappable label child with `data-busy-label` tells
// this function to target just that child; a plain button (stock.html's
// adjust-form save button, 13A's only consumer) has no such child, so
// `querySelector` finds nothing and this falls back to `btn` itself --
// provably identical behavior to before this change for that consumer.
export function setButtonBusy (btn, busy, busyLabel) {
  const labelEl = btn.querySelector('[data-busy-label]') || btn;
  if (busy) {
    if (!originalLabel.has(btn)) originalLabel.set(btn, labelEl.textContent);
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    if (busyLabel) labelEl.textContent = busyLabel;
  } else {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (originalLabel.has(btn)) {
      labelEl.textContent = originalLabel.get(btn);
      originalLabel.delete(btn);
    }
  }
}
