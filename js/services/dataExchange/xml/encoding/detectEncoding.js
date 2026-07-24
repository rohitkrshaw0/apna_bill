// xml/encoding/detectEncoding.js
// BOM sniff (UTF-8/UTF-16 LE/BE) + native TextDecoder. No BOM means we fall
// back to UTF-8 (what every real Tally export observed uses) unless the XML
// declaration itself names an unsupported encoding, in which case we reject
// rather than silently mis-decode.

const BOMS = [
  { bytes: [0xEF, 0xBB, 0xBF], encoding: 'utf-8', bomLength: 3 },
  { bytes: [0xFF, 0xFE], encoding: 'utf-16le', bomLength: 2 },
  { bytes: [0xFE, 0xFF], encoding: 'utf-16be', bomLength: 2 }
];

const SUPPORTED_ENCODINGS = new Set(['utf-8', 'utf-16le', 'utf-16be']);

export function detectEncoding (buffer) {
  const bytes = new Uint8Array(buffer);
  for (const bom of BOMS) {
    if (bom.bytes.every((b, i) => bytes[i] === b)) {
      return { encoding: bom.encoding, bomLength: bom.bomLength, hasBom: true };
    }
  }
  return { encoding: 'utf-8', bomLength: 0, hasBom: false };
}

function sniffDeclaredEncoding (bytes) {
  // Peek at the head as a single-byte charset — good enough to find an
  // ASCII-range `encoding="..."` attribute even if the real body isn't ASCII.
  const head = new TextDecoder('windows-1252').decode(bytes.slice(0, 200));
  const m = /<\?xml[^>]*encoding=["']([^"']+)["']/i.exec(head);
  return m ? m[1].toLowerCase() : null;
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {{ text: string, encoding: string, hasBom: boolean }}
 * @throws {Error} when the encoding is not one of UTF-8/UTF-16LE/UTF-16BE
 */
export function decodeXmlBuffer (buffer) {
  const bytes = new Uint8Array(buffer);
  const bom = detectEncoding(buffer);

  if (!bom.hasBom) {
    const declared = sniffDeclaredEncoding(bytes);
    if (declared && !['utf-8', 'utf8', 'us-ascii', 'ascii'].includes(declared)) {
      throw new Error(`Unsupported XML encoding declared: "${declared}"`);
    }
  }
  if (!SUPPORTED_ENCODINGS.has(bom.encoding)) {
    throw new Error(`Unsupported XML encoding: "${bom.encoding}"`);
  }

  const decoder = new TextDecoder(bom.encoding);
  return { text: decoder.decode(bytes.slice(bom.bomLength)), encoding: bom.encoding, hasBom: bom.hasBom };
}
