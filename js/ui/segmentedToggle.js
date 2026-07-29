// Segmented toggle (2+ mutually exclusive options) — closes the gap
// docs/reports/milestone-13A-ux-audit.md named: .kind-toggle/.kind-btn
// hand-wired identically 4x (items.html's Goods/Service toggle, and 3
// copies of the same markup inside js/ui/quickAddItemDialog.js's shared
// #dlg-quick-item shell, consumed by sale.html/purchase.html/
// manufacturing.html). Emits the SAME classes css/shared.css already
// styles (.kind-toggle, .kind-btn, .kind-btn.active) -- no new CSS.
//
// Adds real toggle-group ARIA (role="radiogroup"/"radio" + aria-checked),
// which none of the 4 hand-written copies had.

export function createSegmentedToggle ({ id, options, value, onChange } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'kind-toggle';
  if (id) wrap.id = id;
  wrap.setAttribute('role', 'radiogroup');

  const buttons = options.map(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kind-btn' + (opt.value === value ? ' active' : '');
    btn.textContent = opt.label;
    btn.dataset.value = opt.value;
    if (opt.id) btn.id = opt.id;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(opt.value === value));
    btn.addEventListener('click', () => setValue(opt.value));
    wrap.appendChild(btn);
    return btn;
  });

  // silent:true updates the visual/ARIA state without re-firing onChange --
  // for a caller resetting the toggle (e.g. reopening a dialog) that
  // doesn't want its own onChange side effects to run.
  function setValue (v, { silent = false } = {}) {
    value = v;
    buttons.forEach(b => {
      const active = b.dataset.value === v;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', String(active));
    });
    if (!silent && onChange) onChange(v);
  }
  function getValue () { return value; }

  return { el: wrap, setValue, getValue };
}
