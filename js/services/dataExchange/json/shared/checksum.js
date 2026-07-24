// json/shared/checksum.js
// Content checksums for the canonical JSON envelope's manifest.checksums
// block. Reuses apnabill/zip/crc32.js's crc32() directly rather than
// duplicating a CRC-32 table -- that file's own header comment already
// self-declares "Zero business/archive-format knowledge -- a pure, generic
// checksum primitive." This is the one deliberate cross-format-engine
// dependency this milestone introduces; see milestone-10-json-design.md
// section 9 for the full justification (why duplicating or relocating it
// were both rejected).

import { crc32 } from '../../apnabill/zip/crc32.js';

/** @param {string} text @returns {string} e.g. "crc32:1a2b3c4d" */
export function computeChecksum (text) {
  const hex = crc32(new TextEncoder().encode(text)).toString(16).padStart(8, '0');
  return `crc32:${hex}`;
}
