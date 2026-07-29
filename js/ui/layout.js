// Shared chip-nav topbar + mobile bottom-nav shell used by every page except
// index.html (which has its own simpler topbar). Previously each page hand-wrote
// its own subset of nav chips and the full 4-tab bottom nav, duplicating the same
// icon SVGs and wiring the same "go to this page" click handlers everywhere.
// Now a page just declares who it is and initShell() builds the rest.

import { icon } from './icons.js';
import { escapeHtml } from './escape.js';

// Keys match each page's DOM id convention (`${key}-nav-btn`) exactly.
const PAGE_META = {
  sale:      { href: 'sale.html',          label: 'Sale',          title: 'Go to sale',          icon: 'sale' },
  items:     { href: 'items.html',         label: 'Items',         title: 'Manage items',        icon: 'items' },
  purchases: { href: 'purchase.html',      label: 'Purchases',     title: 'New purchase',        icon: 'purchases' },
  suppliers: { href: 'suppliers.html',     label: 'Suppliers',     title: 'Manage suppliers',    icon: 'suppliers' },
  stock:     { href: 'stock.html',         label: 'Stock',         title: 'Stock &amp; batches', icon: 'stock' },
  mfg:       { href: 'manufacturing.html', label: 'Manufacturing', title: 'New production run',  icon: 'mfg' },
  menu:      { href: 'menu.html',          label: 'Menu',          title: null,                  icon: 'menu' }
};

const NAV_CHIP_ORDER = ['sale', 'items', 'purchases', 'suppliers', 'stock', 'mfg'];
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

function renderSidebar (el, { current }) {
  // aria-current="page" (Milestone 13A) on the active item -- previously a
  // CSS class only, so the active destination was visually but not
  // programmatically distinguishable.
  el.innerHTML = `
    <div class="sidebar-brand">ApnaBill</div>
    <nav class="sidebar-nav" aria-label="Main navigation">
      ${NAV_CHIP_ORDER.map(id => {
        const m = PAGE_META[id];
        const activeClass = id === current ? ' active' : '';
        const ariaCurrent = id === current ? ' aria-current="page"' : '';
        return `<a class="sidebar-item${activeClass}" href="${m.href}"${ariaCurrent}>${icon(m.icon, { size: 20 })}<span>${m.label}</span></a>`;
      }).join('')}
    </nav>
  `;
}

function renderBottomNav (el, { active }) {
  el.innerHTML = BOTTOM_NAV_ORDER.map(id => {
    const m = PAGE_META[id];
    const activeClass = id === active ? ' active' : '';
    const ariaCurrent = id === active ? ' aria-current="page"' : '';
    return `<a class="bn-item${activeClass}" href="${m.href}"${ariaCurrent}>${icon(m.icon, { size: 21 })}<span>${m.label}</span></a>`;
  }).join('');
}

// Shell chrome that is byte-identical on every page (all but index.html, which has
// its own simpler topbar): the empty sidebar/bottom-nav elements and the
// theme-toggle button. Previously each page hand-wrote these ~3 lines even though
// they never vary — auto-created here (only if the page hasn't already hand-written
// them, so pages mid-migration are unaffected) so pages stop duplicating markup that
// has no page-specific content. Sidebar/bottom-nav are `position:fixed`, so where
// they land in the DOM doesn't affect rendering — appended to <body>. theme-toggle
// is always the last child of `.topbar-right` on every page that has one (verified
// across all 7), so it's safe to append there.
function ensureShellChrome ({ sidebarSelector, bottomNavSelector }) {
  if (!document.querySelector(sidebarSelector)) {
    const nav = document.createElement('nav');
    nav.className = 'sidebar';
    nav.id = 'sidebar';
    // aria-label (Milestone 13A): these two are sibling <nav> landmarks
    // present in the DOM at the same time (CSS, not markup, decides which
    // is visible at a given width) -- previously neither was labeled, so a
    // screen reader user had no way to tell them apart.
    nav.setAttribute('aria-label', 'Main navigation');
    document.body.appendChild(nav);
  }
  if (!document.querySelector(bottomNavSelector)) {
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.setAttribute('aria-label', 'Mobile navigation');
    document.body.appendChild(nav);
  }
  const topbarRight = document.querySelector('.topbar-right');
  if (topbarRight && !topbarRight.querySelector('#theme-toggle')) {
    const btn = document.createElement('button');
    btn.id = 'theme-toggle';
    btn.className = 'icon-btn theme-toggle';
    btn.type = 'button';
    btn.title = 'Toggle dark mode';
    btn.setAttribute('aria-label', 'Toggle dark mode');
    topbarRight.appendChild(btn);
  }
}

// Milestone 13A / Design System §22 (via the 13A UX audit's "Shape A"
// finding): stock.html, items.html, suppliers.html and menu.html each hand
// -write the identical 9-line topbar shell, differing only in the crumb
// text. This factory generates that same markup so a page can stop
// duplicating it. `backLabel` is the back button's initial text content --
// initShell()'s own back-button rewrite (above) replaces it with an icon +
// sr-hideable span the same way it always has, so this only changes WHERE
// the initial markup comes from, not what it ends up being. Not adopted by
// sale.html/purchase.html/manufacturing.html (Shapes B/C, which carry extra
// firm/date chips) or index.html (its own bespoke topbar) -- see the 13A
// migration roadmap in docs/reports/milestone-13A-ux-audit.md §Part 4.
export function renderPageHeader ({ backLabel, crumb }) {
  return `<header class="topbar">
  <button id="back-btn" class="back-btn">${escapeHtml(backLabel)}</button>
  <div class="brand"><span id="brand-company-name" class="brand-name">—</span><span class="brand-crumb">${escapeHtml(crumb)}</span></div>
  <div class="topbar-right">
    <nav class="nav-chips" id="nav-chips"></nav>
  </div>
</header>`;
}

// current: this page's key ('sale' | 'items' | 'purchases' | 'stock' | 'mfg' | 'menu').
// backHref: where the back button goes.
// only: override which nav chips show (default: every page except `current`) — used
//   by menu.html, which only chips Sale/Items/Stock since Purchases/Manufacturing/
//   Suppliers are already listed as menu rows.
// bottomNavActive: which of the 4 fixed bottom-nav tabs to highlight, if not `current`
//   itself (purchase.html, manufacturing.html and suppliers.html aren't one of the 4
//   tabs, so they highlight 'menu', the section they live under).
//
// NOTE: because this now creates #theme-toggle when a page doesn't hand-write it,
// initShell() must run BEFORE initThemeToggle() on any page relying on that
// auto-creation — otherwise initThemeToggle finds no button yet and no-ops.
export function initShell ({ current, backHref, only, bottomNavActive, navChipsSelector = '#nav-chips', sidebarSelector = '#sidebar', bottomNavSelector = 'nav.bottom-nav', backBtnSelector = '#back-btn' }) {
  ensureShellChrome({ sidebarSelector, bottomNavSelector });

  const navChipsEl = document.querySelector(navChipsSelector);
  if (navChipsEl) renderNavChips(navChipsEl, { current, only });

  const sidebarEl = document.querySelector(sidebarSelector);
  if (sidebarEl) renderSidebar(sidebarEl, { current });

  const bottomNavEl = document.querySelector(bottomNavSelector);
  if (bottomNavEl) renderBottomNav(bottomNavEl, { active: bottomNavActive || current });

  const backBtn = document.querySelector(backBtnSelector);
  if (backBtn && backHref) {
    const label = backBtn.textContent.trim();
    // Label wrapped in its own span (not a bare text node) so shared.css can
    // hide just the label at very narrow widths, keeping the icon — the back
    // button still fully works, it just stops crowding out the company name
    // (the more important piece of topbar info on a narrow phone screen).
    backBtn.innerHTML = icon('back', { size: 16 }) + `<span class="back-btn-label">${label}</span>`;
    backBtn.addEventListener('click', () => { window.location.href = backHref; });
  }
}
