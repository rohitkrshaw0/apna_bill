// Call once per page (e.g. at boot) so opening one kebab menu closes the others.
export function initKebabAutoClose () {
  document.addEventListener('click', () => {
    document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
  });
}

// actions: [{ label, danger, onClick }]
export function createKebabMenu (actions) {
  const wrap = document.createElement('button');
  wrap.className = 'kebab';
  wrap.setAttribute('aria-label', 'More');
  wrap.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
    <div class="menu">
      ${actions.map((a, i) => `<button type="button" data-i="${i}"${a.danger ? ' class="danger"' : ''}>${a.label}</button>`).join('')}
    </div>
  `;
  const menu = wrap.querySelector('.menu');
  wrap.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.menu.open').forEach(m => { if (m !== menu) m.classList.remove('open'); });
    menu.classList.toggle('open');
  });
  actions.forEach((a, i) => {
    menu.querySelector(`[data-i="${i}"]`).addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.remove('open');
      a.onClick();
    });
  });
  return wrap;
}
