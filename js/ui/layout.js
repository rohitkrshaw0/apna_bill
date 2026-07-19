// Shared chip-nav topbar + mobile bottom-nav shell used by every page except
// index.html (which has its own simpler topbar). Previously each page hand-wrote
// its own subset of nav chips and the full 4-tab bottom nav, duplicating the same
// icon SVGs and wiring the same "go to this page" click handlers everywhere.
// Now a page just declares who it is and initShell() builds the rest.

const ICON_PATHS = {
  sale: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  items: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  purchases: '<path d="M16 16h.01M16 16a4 4 0 1 0-8 0M2 9h20l-1.5 11H3.5L2 9z"/>',
  stock: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  mfg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'
};

function icon (name, size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
}

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
    return `<button id="${id}-nav-btn" class="chip chip-btn"${titleAttr} type="button">${icon(m.icon, 14)}<span>${m.label}</span></button>`;
  }).join('');
  for (const id of ids) {
    el.querySelector(`#${id}-nav-btn`).addEventListener('click', () => { window.location.href = PAGE_META[id].href; });
  }
}

function renderBottomNav (el, { active }) {
  el.innerHTML = BOTTOM_NAV_ORDER.map(id => {
    const m = PAGE_META[id];
    const activeClass = id === active ? ' active' : '';
    return `<a class="bn-item${activeClass}" href="${m.href}">${icon(m.icon, 21)}<span>${m.label}</span></a>`;
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
  if (backBtn && backHref) backBtn.addEventListener('click', () => { window.location.href = backHref; });
}
