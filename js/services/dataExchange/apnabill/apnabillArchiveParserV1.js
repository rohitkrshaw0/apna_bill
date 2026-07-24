// apnabill/apnabillArchiveParserV1.js
// The inverse of apnabillArchiveFormatterV1.js: reads a .apnabill archive
// (ZIP bytes) back into { manifest, snapshot }, where snapshot is shaped
// EXACTLY like generate_company_backup_snapshot()'s return value -- ready
// to hand straight to restore_company_from_snapshot() (restore_rpc.sql)
// without any further reshaping. Uses zip/zipReader.js, which already
// CRC-verifies every entry as it reads -- a corrupted archive fails here,
// loudly, before a single byte of it is ever trusted as real business data.
//
// Table list and order mirror apnabillArchiveFormatterV1.js's own copy
// exactly (which mirrors backup_rpc.sql's jsonb_build_object -- see that
// file's comment on why all three are kept in lockstep).

import { readZip } from './zip/zipReader.js';

const TABLE_KEYS = [
  'company', 'firms', 'parties', 'items', 'item_custom_field_defs',
  'item_custom_field_values', 'batches', 'stock_ledger', 'payment_types',
  'invoice_prefixes', 'invoices', 'invoice_lines', 'payments', 'purchases',
  'purchase_lines', 'manufacturing_runs', 'manufacturing_lines',
  'loyalty_transactions', 'print_settings', 'audit_log', 'invoice_attachments'
];

/**
 * @param {Uint8Array} archiveBytes a .apnabill file's raw bytes
 * @returns {{manifest: object, snapshot: object}}
 */
export function parseBackupArchive (archiveBytes) {
  const entries = readZip(archiveBytes);
  const decoder = new TextDecoder();
  const byName = new Map(entries.map(e => [e.name, e]));

  const manifestEntry = byName.get('manifest.json');
  if (!manifestEntry) {
    throw new Error('Not a valid .apnabill archive: manifest.json is missing');
  }
  const manifest = JSON.parse(decoder.decode(manifestEntry.bytes));

  const snapshot = {};
  for (const key of TABLE_KEYS) {
    const entry = byName.get(`${key}.json`);
    // Deliberately does NOT set snapshot[key] at all when the file is
    // genuinely absent -- that keeps `key in snapshot` meaningful for
    // apnabillRestoreProvider.js's validateSchema(), distinguishing a
    // structurally incomplete archive (no file for this table at all) from
    // a complete one whose file legitimately holds the JSON literal `null`
    // (exactly what apnabillArchiveFormatterV1.js writes for a null company
    // or an originally-missing table -- never fabricated as `[]`).
    if (entry) snapshot[key] = JSON.parse(decoder.decode(entry.bytes));
  }

  return { manifest, snapshot };
}
