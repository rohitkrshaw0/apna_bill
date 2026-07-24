// xml/export/download.js
// The "Output File" step -- triggers a browser download of generated XML
// text. No existing download helper was found anywhere in the codebase.

export function downloadXmlFile (filename, xmlText) {
  const blob = new Blob([xmlText], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
