import { createKebabMenu } from './kebabMenu.js';

// A row in a browsable list (items.html's item list, stock.html's item list, and any
// future "name + badges, meta line, one or more value columns, trailing action" list —
// this is the .item-row shape already styled in shared.css). `values` is rendered as
// however many extra columns the CSS grid expects for that page (items.html needs two:
// a stock chip and a price; stock.html needs one). `trailing` is either a chevron
// (navigate into a detail view) or a kebab menu (row actions), matching the two
// patterns already in use.
export function createListRow ({ primaryText, badgesHtml = '', meta = '', values = [], trailing, onClick }) {
  const row = document.createElement('div');
  row.className = 'item-row';
  const valuesHtml = values.map(v => `<div class="${v.className || ''}">${v.html || ''}</div>`).join('');
  row.innerHTML = `
    <div>
      <div class="name"><span></span>${badgesHtml}</div>
      <div class="meta">${meta}</div>
    </div>
    ${valuesHtml}
    <span class="row-trailing"></span>
  `;
  row.querySelector('.name > span').textContent = primaryText;

  const trailingEl = row.querySelector('.row-trailing');
  if (trailing?.type === 'kebab') {
    trailingEl.replaceWith(createKebabMenu(trailing.actions));
  } else if (trailing?.type === 'chevron') {
    trailingEl.className = 'chevron';
    trailingEl.textContent = '›';
  } else {
    trailingEl.remove();
  }

  if (onClick) {
    // A real <button> here would be invalid HTML — a kebab menu is itself a
    // <button> and can end up nested inside this row (see trailing.type ===
    // 'kebab' above) — so this stays a <div> made accessible the standard
    // WAI-ARIA way instead: role + keyboard reachability + Enter/Space
    // activation, same technique as partyRow.js's row-edit affordance.
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.addEventListener('click', (e) => { if (!e.target.closest('.kebab')) onClick(e); });
    row.addEventListener('keydown', (e) => {
      if (e.target.closest('.kebab')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
    });
  }
  return row;
}

// Renders a list of rows into a container, toggling an empty-state element, and
// appending (rather than clearing) when loading another page of results.
export function createDataTable ({ listSelector, emptySelector, renderRow }) {
  const listEl = document.querySelector(listSelector);
  const emptyEl = emptySelector ? document.querySelector(emptySelector) : null;
  return {
    setRows (items, { append = false } = {}) {
      if (!append) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.toggle('hidden', items.length > 0);
      }
      for (const item of items) listEl.appendChild(renderRow(item));
    }
  };
}
