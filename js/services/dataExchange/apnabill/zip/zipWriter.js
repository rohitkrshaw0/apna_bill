// apnabill/zip/zipWriter.js
// A pure, generic ZIP archive writer (STORE method only -- no compression
// library exists anywhere in this browser codebase, and the archive's
// contents are already-compact JSON text, so STORE keeps this a primitive
// with zero external dependencies, same spirit as crc32.js's own "pure,
// generic checksum primitive" note). Knows nothing about backups,
// companies, or table names -- takes named, already-encoded byte buffers
// in and produces one ZIP-format Uint8Array out, following the PKZIP
// APPNOTE local-file-header / central-directory / end-of-central-directory
// structure every unzip tool (Windows Explorer included) expects. One
// layer up (a future backup provider) decides what files go in and what
// bytes they contain; this file only knows how to pack bytes that already
// exist.
//
// Deliberately no ZIP64: a company backup is per-tenant JSON, not a
// multi-gigabyte archive, so the classic 32-bit limits (4GB per file/
// archive, 65535 entries) are never a real constraint here.

import { crc32 } from './crc32.js';

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;
const VERSION_NEEDED = 20; // 2.0 -- minimum that supports STORE + long file names, no zip64
const STORE_METHOD = 0;

/** JS Date -> ZIP's 16-bit DOS time/date fields (2-second resolution, no timezone). */
function toDosDateTime (date) {
  const dosTime = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F);
  const dosDate = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
  return { dosTime, dosDate };
}

/** A minimal little-endian byte accumulator -- every ZIP header field is fixed-width LE. */
function createByteWriter () {
  const chunks = [];
  let length = 0;

  function pushBytes (bytes) { chunks.push(bytes); length += bytes.length; }
  function pushUint16 (value) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, value, true); pushBytes(b); }
  function pushUint32 (value) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value, true); pushBytes(b); }

  function toBytes () {
    const out = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  }

  return { pushBytes, pushUint16, pushUint32, get length () { return length; }, toBytes };
}

/**
 * @param {Array<{name: string, bytes: Uint8Array}>} entries
 * @param {Date} [date] one mtime stamped on every entry -- a backup archive's files
 *   are all produced in the same instant, so per-file mtimes would be false precision
 * @returns {Uint8Array} a complete, valid ZIP archive (STORE method, no compression)
 */
export function buildZip (entries, date = new Date()) {
  const { dosTime, dosDate } = toDosDateTime(date);
  const encoder = new TextEncoder();
  const local = createByteWriter();
  const central = createByteWriter();
  const centralRecords = [];

  for (const { name, bytes } of entries) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(bytes);
    const localOffset = local.length;

    local.pushUint32(LOCAL_FILE_HEADER_SIG);
    local.pushUint16(VERSION_NEEDED);
    local.pushUint16(0); // general purpose bit flag
    local.pushUint16(STORE_METHOD);
    local.pushUint16(dosTime);
    local.pushUint16(dosDate);
    local.pushUint32(crc);
    local.pushUint32(bytes.length); // compressed size == uncompressed size under STORE
    local.pushUint32(bytes.length);
    local.pushUint16(nameBytes.length);
    local.pushUint16(0); // extra field length
    local.pushBytes(nameBytes);
    local.pushBytes(bytes);

    centralRecords.push({ nameBytes, crc, size: bytes.length, localOffset });
  }

  for (const { nameBytes, crc, size, localOffset } of centralRecords) {
    central.pushUint32(CENTRAL_DIR_HEADER_SIG);
    central.pushUint16(VERSION_NEEDED); // version made by
    central.pushUint16(VERSION_NEEDED); // version needed to extract
    central.pushUint16(0); // general purpose bit flag
    central.pushUint16(STORE_METHOD);
    central.pushUint16(dosTime);
    central.pushUint16(dosDate);
    central.pushUint32(crc);
    central.pushUint32(size);
    central.pushUint32(size);
    central.pushUint16(nameBytes.length);
    central.pushUint16(0); // extra field length
    central.pushUint16(0); // file comment length
    central.pushUint16(0); // disk number start
    central.pushUint16(0); // internal file attributes
    central.pushUint32(0); // external file attributes
    central.pushUint32(localOffset);
    central.pushBytes(nameBytes);
  }

  const centralDirOffset = local.length;
  const centralDirSize = central.length;

  const eocd = createByteWriter();
  eocd.pushUint32(END_OF_CENTRAL_DIR_SIG);
  eocd.pushUint16(0); // number of this disk
  eocd.pushUint16(0); // disk where central directory starts
  eocd.pushUint16(centralRecords.length); // central dir records on this disk
  eocd.pushUint16(centralRecords.length); // total central dir records
  eocd.pushUint32(centralDirSize);
  eocd.pushUint32(centralDirOffset);
  eocd.pushUint16(0); // comment length

  const out = new Uint8Array(local.length + central.length + eocd.length);
  out.set(local.toBytes(), 0);
  out.set(central.toBytes(), local.length);
  out.set(eocd.toBytes(), local.length + central.length);
  return out;
}
