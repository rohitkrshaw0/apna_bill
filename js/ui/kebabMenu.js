import { icon } from './icons.js';

function closeAllOpenMenus () {
  document.querySelectorAll('.menu.open').forEach(m => {
    m.classList.remove('open');
    m.closest('.kebab')?.setAttribute('aria-expanded', 'false');
  });
}

// Call once per page (e.g. at boot) so opening one kebab menu closes the
// others, and so Escape closes whichever is open (Milestone 13A).
export function initKebabAutoClose () {
  document.addEventListener('click', closeAllOpenMenus);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllOpenMenus();
  });
}

// actions: [{ label, danger, onClick }]
export function createKebabMenu (actions) {
  // A <div role="button"> trigger, not a real <button> (Milestone 13A fix
  // for a real invalid-HTML defect found in the audit): the old version
  // nested a real <button> (each menu action, below) inside another real
  // <button> (this trigger), which browsers reparent unpredictably and
  // assistive tech handles inconsistently. dataTable.js's clickable rows
  // and partyRow.js's edit affordance both already avoid this same
  // nesting the same way -- this file was the one outlier. .kebab's CSS
  // (cursor, sizing, hover) applies identically to a div.
  const wrap = document.createElement('div');
  wrap.className = 'kebab';
  wrap.setAttribute('role', 'button');
  wrap.setAttribute('tabindex', '0');
  wrap.setAttribute('aria-label', 'More');
  wrap.setAttribute('aria-haspopup', 'menu');
  wrap.setAttribute('aria-expanded', 'false');
  wrap.innerHTML = `
    ${icon('kebab', { size: 18 })}
    <div class="menu" role="menu">
      ${actions.map((a, i) => `<button type="button" role="menuitem" data-i="${i}"${a.danger ? ' class="danger"' : ''}>${a.label}</button>`).join('')}
    </div>
  `;
  const menu = wrap.querySelector('.menu');

  function setOpen (open) {
    menu.classList.toggle('open', open);
    wrap.setAttribute('aria-expanded', String(open));
    // Real ARIA menu-button behavior: opening moves focus to the first
    // item; closing restores it to the trigger. Previously the trigger
    // never moved focus at all -- a keyboard user had no way to reach the
    // menu's own items without a mouse.
    if (open) menu.querySelector('button')?.focus();
    else wrap.focus();
  }

  function toggle (e) {
    e.stopPropagation();
    const opening = !menu.classList.contains('open');
    closeAllOpenMenus();
    setOpen(opening);
  }

  wrap.addEventListener('click', toggle);
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); }
  });
  actions.forEach((a, i) => {
    menu.querySelector(`[data-i="${i}"]`).addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(false);
      a.onClick();
    });
  });
  return wrap;
}
