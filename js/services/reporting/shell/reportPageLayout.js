// shell/reportPageLayout.js
// The shared Report Shell (Milestone 14A "Shared Report Shell" / "Shared
// Report Layout"). Deliberately thin: it composes the EXISTING, unmodified
// js/ui/layout.js factories (renderPageHeader/initShell -- the Product
// Experience Platform, frozen for this milestone) rather than
// reimplementing a topbar or navigation shell. This file's only job is to
// give every future report screen ONE call that wires the page header +
// shell chrome the exact same way every migrated business screen already
// does, plus the three slot ids every report screen composes its own
// toolbar/filter-bar/content into.
//
// `current` is deliberately a key that matches no js/ui/layout.js
// PAGE_META entry (the same technique dashboard.html already uses,
// Milestone 13C) -- renderSidebar()/renderNavChips() degrade gracefully
// on an unmatched key (no active highlight, no error), so every report
// screen gets full sidebar/topbar/bottom-nav chrome without this
// milestone adding a `reports`/report-specific entry to the frozen
// PAGE_META/NAV_CHIP_ORDER/BOTTOM_NAV_ORDER catalog.

import { renderPageHeader, initShell } from '../../../ui/layout.js';

export const REPORT_SHELL_IDS = Object.freeze({
  TOOLBAR: 'report-toolbar',
  FILTER_BAR: 'report-filter-bar',
  CONTENT: 'report-content'
});

/**
 * @param {{backLabel: string, crumb: string}} opts forwarded to renderPageHeader()
 * @returns {string} the page-header markup string, same contract renderPageHeader() itself has
 */
export function renderReportPageHeader (opts) {
  return renderPageHeader(opts);
}

/**
 * @param {{backHref: string, only?: string[], bottomNavActive?: string}} opts forwarded to initShell(),
 *   with `current: 'reports'` fixed (matches no PAGE_META key -- see header comment)
 */
export function initReportShell ({ backHref, only, bottomNavActive } = {}) {
  initShell({ current: 'reports', backHref, only, bottomNavActive });
}

/**
 * The three-slot content region every report screen's own <main> composes
 * into: toolbar, filter bar, and lifecycle-driven content. Returned as a
 * markup string (same authoring convention as renderPageHeader()) so a
 * page assigns it via `container.innerHTML = renderReportShellSlots()`
 * once, then fills each slot independently.
 * @returns {string}
 */
export function renderReportShellSlots () {
  return `
    <div id="${REPORT_SHELL_IDS.TOOLBAR}"></div>
    <div id="${REPORT_SHELL_IDS.FILTER_BAR}"></div>
    <div id="${REPORT_SHELL_IDS.CONTENT}"></div>
  `;
}
