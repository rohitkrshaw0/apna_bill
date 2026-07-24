// apnabill/zip/zipReader.js
// A pure, generic ZIP archive reader (STORE method only) -- the counterpart
// to zipWriter.js. Reads the central directory per the PKZIP APPNOTE and
// re-verifies every entry's CRC-32 against crc32.js as it goes, so a caller
// gets tamper/corruption detection for free instead of blind trust. Knows
// nothing about backups, companies, or table names -- returns a flat list
// of {name, bytes, crc} and throws a plain Error for any structural problem
// (bad signature, unsupported compression method, size mismatch, CRC
// mismatch, truncated data). Mapping that into a ValidationResult (this
// platform's own error/validation shape) is a caller's job one layer up --
// see apnabillBackupProvider.js's verify(), which does exactly that.

import { crc32 } from './crc32.js';

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;
const EOCD_FIXED_SIZE = 22;
const STORE_METHOD = 0;

/**
 * Searches backward for the EOCD signature rather than assuming it's the
 * last 22 bytes -- a ZIP MAY carry a trailing comment of 0-65535 bytes
 * after the fixed record. zipWriter.js never writes one, but a caller may
 * hand this reader a ZIP this codebase didn't itself produce.
 */
function findEndOfCentralDirectory (view, totalLength) {
  const searchFloor = Math.max(0, totalLength - EOCD_FIXED_SIZE - 0xFFFF);
  for (let offset = totalLength - EOCD_FIXED_SIZE; offset >= searchFloor; offset--) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIR_SIG) return offset;
  }
  throw new Error('Not a valid ZIP archive: end-of-central-directory record not found');
}

/**
 * @param {Uint8Array} bytes a complete ZIP archive
 * @returns {{name: string, bytes: Uint8Array, crc: number}[]} every entry, CRC-verified
 */
export function readZip (bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < EOCD_FIXED_SIZE) {
    throw new Error('Not a valid ZIP archive: too short to contain an end-of-central-directory record');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view, bytes.length);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const decoder = new TextDecoder();
  const entries = [];
  let offset = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_DIR_HEADER_SIG) {
      throw new Error(`Not a valid ZIP archive: central directory signature mismatch at entry ${i}`);
    }

    const method = view.getUint16(offset + 10, true);
    if (method !== STORE_METHOD) {
      throw new Error(`Entry ${i}: unsupported ZIP compression method (${method}) -- only STORE (0) is supported`);
    }

    const expectedCrc = view.getUint32(offset + 16, true);
    const compSize = view.getUint32(offset + 20, true);
    const uncompSize = view.getUint32(offset + 24, true);
    if (compSize !== uncompSize) {
      throw new Error(`Entry ${i}: compressed size differs from uncompressed size under STORE -- corrupt or non-STORE archive`);
    }

    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLen));

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_FILE_HEADER_SIG) {
      throw new Error(`Entry "${name}": local file header signature mismatch`);
    }
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > bytes.length) {
      throw new Error(`Entry "${name}": declared size extends past the end of the archive`);
    }
    const data = bytes.slice(dataStart, dataEnd);

    const actualCrc = crc32(data);
    if (actualCrc !== expectedCrc) {
      throw new Error(`Entry "${name}": CRC-32 mismatch (expected ${expectedCrc.toString(16)}, got ${actualCrc.toString(16)}) -- archive is corrupted`);
    }

    entries.push({ name, bytes: data, crc: expectedCrc });
    offset += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}
