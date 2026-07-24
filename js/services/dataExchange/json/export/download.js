// json/export/download.js
// The "Output File" step -- triggers a browser download of generated JSON
// text. Mirrors xml/export/download.js exactly (not called by runJsonExport()
// itself, left for a future UI screen, same asymmetry documented in
// docs/data-exchange-architecture.md section 7).

export function downloadJsonFile (filename, jsonText) {
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
