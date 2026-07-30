// export/csvExport.js
// Export Framework, CSV half (Milestone 14A "Export Framework"). A
// generic rows+columns -> CSV Blob/download utility -- deliberately new,
// narrow, and independent of the Data Exchange Platform's own exporters
// (js/services/dataExchange/**), which serialize to Tally XML / canonical
// JSON for system-to-system interop, the wrong shape for "let a user
// download the rows currently on their screen as a spreadsheet." The
// Import/Export Platform is frozen for this milestone and is not
// imported anywhere in this file.
//
// No report calls this yet -- it exists so a future report's own Export
// button (wired through shell/reportToolbar.js) has one correct,
// shared implementation to call rather than reinventing CSV escaping
// per report.

/**
 * @param {object[]} rows
 * @param {{key: string, label: string}[]} columns
 * @returns {string} a CSV document, CRLF line endings, RFC 4180-style quoting
 */
export function rowsToCsv (rows, columns) {
  const escapeCell = (value) => {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}

/**
 * Triggers a browser download of the given rows as a CSV file. No
 * network call, no server round-trip -- a client-side Blob + a
 * synthetic anchor click, the standard browser-native download pattern.
 * @param {object[]} rows
 * @param {{key: string, label: string}[]} columns
 * @param {string} [filename]
 */
export function downloadCsv (rows, columns, filename = 'report.csv') {
  const csv = rowsToCsv(rows, columns);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
