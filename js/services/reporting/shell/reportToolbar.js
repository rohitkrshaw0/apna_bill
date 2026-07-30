// shell/reportToolbar.js
// Report Toolbar (Milestone 14A). Print/Export actions, built entirely
// from js/ui/button.js's existing createButton()/setButtonBusy() --
// unmodified, no new button variant, no new CSS class. This is the SAME
// component every future report screen (14B+) will use once it has real
// row data to export -- nothing here is a hub-page-specific shim.
//
// Export is expressed as *disabled with a reason* rather than omitted
// entirely when a caller has no exportable rows yet (e.g. the Reports hub
// page itself, which lists report definitions, not report data) -- a
// disabled, explained control is not a fake feature; it is an accurate
// reflection of "this exists, there is nothing to act on yet."
//
// js/ui/icons.js's catalog (frozen, part of the Shared UX Foundation) has
// no printer/download entry -- both are decorative-only here (the
// button's own text label already carries the accessible name), so a
// minimal inline SVG is used directly rather than adding a new entry to
// that frozen catalog for a two-consumer glyph.

import { createButton, setButtonBusy } from '../../../ui/button.js';

const PRINTER_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
const DOWNLOAD_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

function prependIcon (btn, svgMarkup) {
  const span = document.createElement('span');
  span.innerHTML = svgMarkup;
  span.style.display = 'inline-flex';
  span.style.marginRight = '6px';
  span.style.verticalAlign = 'middle';
  btn.prepend(span);
}

/**
 * @param {object} opts
 * @param {() => void} [opts.onPrint]
 * @param {() => void|Promise<void>} [opts.onExport]
 * @param {boolean} [opts.exportDisabled]
 * @param {string} [opts.exportDisabledReason] shown as a title/tooltip when exportDisabled
 * @returns {{el: HTMLElement, printBtn: HTMLButtonElement, exportBtn: HTMLButtonElement, setExporting: (busy: boolean) => void}}
 */
export function createReportToolbar ({ onPrint, onExport, exportDisabled = false, exportDisabledReason = '' } = {}) {
  const el = document.createElement('div');
  el.className = 'report-toolbar';
  el.setAttribute('role', 'toolbar');
  el.setAttribute('aria-label', 'Report actions');

  const printBtn = createButton({ label: 'Print', variant: 'ghost', onClick: onPrint });
  prependIcon(printBtn, PRINTER_SVG);

  const exportBtn = createButton({ label: 'Export', variant: 'ghost', onClick: exportDisabled ? undefined : onExport });
  prependIcon(exportBtn, DOWNLOAD_SVG);
  if (exportDisabled) {
    exportBtn.disabled = true;
    if (exportDisabledReason) exportBtn.title = exportDisabledReason;
  }

  el.appendChild(printBtn);
  el.appendChild(exportBtn);

  function setExporting (busy) {
    setButtonBusy(exportBtn, busy, 'Exporting…');
  }

  return { el, printBtn, exportBtn, setExporting };
}
