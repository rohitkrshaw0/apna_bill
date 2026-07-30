// export/printExport.js
// Export Framework, Print half (Milestone 14A "Print Framework" /
// "Export Framework"). Triggers the browser's own native print dialog
// against css/report-print.css's @media print rules -- no PDF library
// dependency, consistent with this app's no-bundler, no-npm-build
// philosophy (every existing platform in this repository is plain ES
// modules with zero runtime dependencies).

/**
 * @param {{beforePrint?: () => void, afterPrint?: () => void}} [hooks]
 *   optional hooks a report screen can use to swap in a print-only view
 *   before printing and restore it after -- unused by the Reports hub
 *   page, which prints its normal DOM as-is.
 */
export function triggerPrint ({ beforePrint, afterPrint } = {}) {
  if (beforePrint) beforePrint();
  const cleanup = () => { if (afterPrint) afterPrint(); window.removeEventListener('afterprint', cleanup); };
  if (afterPrint) window.addEventListener('afterprint', cleanup);
  window.print();
}
