// Shared chip-nav topbar + mobile bottom-nav shell used by every page except
// index.html (which has its own simpler topbar). Previously each page hand-wrote
// its own subset of nav chips and the full 4-tab bottom nav, duplicating the same
// icon SVGs and wiring the same "go to this page" click handlers everywhere.
// Now a page just declares who it is and initShell() builds the rest.

import { icon } from './icons.js';

// Keys match each page's DOM id convention (`${key}-nav-btn`) exactly.
const PAGE_META = {
  sale:      { href: 'sale.html',          label: 'Sale',          title: 'Go to sale',          icon: 'sale' },
  items:     { href: 'items.html',         label: 'Items',         title: 'Manage items',        icon: 'items' },
  purchases: { href: 'purchase.html',      label: 'Purchases',     title: 'New purchase',        icon: 'purchases' },
  stock:     { href: 'stock.html',         label: 'Stock',         title: 'Stock &amp; batches', icon: 'stock' },
  mfg:       { href: 'manufacturing.html', label: 'Manufacturing', title: 'New production run',  icon: 'mfg' },
  menu:      { href: 'menu.html',          label: 'Menu',          title: null,                  icon: 'menu' }
};

const NAV_CHIP_ORDER = ['sale', 'items', 'purchases', 'stock', 'mfg'];
const BOTTOM_NAV_ORDER = ['sale', 'items', 'stock', 'menu'];

function renderNavChips (el, { current, only }) {
  const ids = only || NAV_CHIP_ORDER.filter(id => id !== current);
  el.innerHTML = ids.map(id => {
    const m = PAGE_META[id];
    const titleAttr = m.title ? ` title="${m.title}"` : '';
    return `<button id="${id}-nav-btn" class="chip chip-btn"${titleAttr} type="button">${icon(m.icon, { size: 14 })}<span>${m.label}</span></button>`;
  }).join('');
  for (const id of ids) {
    el.querySelector(`#${id}-nav-btn`).addEventListener('click', () => { window.location.href = PAGE_META[id].href; });
  }
}

function renderBottomNav (el, { active }) {
  el.innerHTML = BOTTOM_NAV_ORDER.map(id => {
    const m = PAGE_META[id];
    const activeClass = id === active ? ' active' : '';
    return `<a class="bn-item${activeClass}" href="${m.href}">${icon(m.icon, { size: 21 })}<span>${m.label}</span></a>`;
  }).join('');
}

// current: this page's key ('sale' | 'items' | 'purchases' | 'stock' | 'mfg' | 'menu').
// backHref: where the back button goes.
// only: override which nav chips show (default: every page except `current`) — used
//   by menu.html, which only chips Sale/Items/Stock since Purchases/Manufacturing are
//   already listed as menu rows.
// bottomNavActive: which of the 4 fixed bottom-nav tabs to highlight, if not `current`
//   itself (purchase.html and manufacturing.html aren't one of the 4 tabs, so they
//   highlight 'menu', the section they live under).
export function initShell ({ current, backHref, only, bottomNavActive, navChipsSelector = '#nav-chips', bottomNavSelector = 'nav.bottom-nav', backBtnSelector = '#back-btn' }) {
  const navChipsEl = document.querySelector(navChipsSelector);
  if (navChipsEl) renderNavChips(navChipsEl, { current, only });

  const bottomNavEl = document.querySelector(bottomNavSelector);
  if (bottomNavEl) renderBottomNav(bottomNavEl, { active: bottomNavActive || current });

  const backBtn = document.querySelector(backBtnSelector);
  if (backBtn && backHref) {
    const label = backBtn.textContent.trim();
    backBtn.innerHTML = icon('back', { size: 16 }) + label;
    backBtn.addEventListener('click', () => { window.location.href = backHref; });
  }
}
