// apnabill/zip/crc32.js
// Standard CRC-32 (IEEE 802.3 / ZIP / PNG / gzip polynomial 0xEDB88320,
// init 0xFFFFFFFF, final XOR 0xFFFFFFFF), computed incrementally so a
// byte stream can be checksummed chunk-by-chunk without ever buffering
// the whole thing just to compute this. Zero business/archive-format
// knowledge -- a pure, generic checksum primitive.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32Init () { return 0xFFFFFFFF >>> 0; }

export function crc32Update (crc, bytes) {
  for (let i = 0; i < bytes.length; i++) {
    crc = TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return crc >>> 0;
}

export function crc32Finalize (crc) { return (crc ^ 0xFFFFFFFF) >>> 0; }

/** One-shot convenience for a complete, already-in-memory buffer. */
export function crc32 (bytes) {
  return crc32Finalize(crc32Update(crc32Init(), bytes));
}
