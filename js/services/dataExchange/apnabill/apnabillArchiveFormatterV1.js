// apnabill/apnabillArchiveFormatterV1.js
// Implements 9A's formatters/contract.js IFormatter for the .apnabill backup
// format. Turns one generate_company_backup_snapshot() result (see
// backup_rpc.sql) into a complete ZIP archive: one JSON file per table, plus
// a manifest.json a future Restore Framework reads first -- format version
// and file list -- before it trusts anything else in the archive. This is
// the one file under apnabill/ that knows what a "company" or "invoice"
// table even is; apnabill/zip/** (crc32.js, zipWriter.js) stays a pure,
// generic ZIP container and never sees these names, the same split as 9C's
// tallyXmlWriter.js (generic) vs. tallyXmlFormatterV1.js (Tally-specific).
//
// Table list and order mirror backup_rpc.sql's jsonb_build_object exactly,
// so the two files can be diffed against each other when the schema changes.

import { buildZip } from './zip/zipWriter.js';
import { createVersion, formatVersion } from '../shared/version/index.js';

const TABLE_KEYS = [
  'company', 'firms', 'parties', 'items', 'item_custom_field_defs',
  'item_custom_field_values', 'batches', 'stock_ledger', 'payment_types',
  'invoice_prefixes', 'invoices', 'invoice_lines', 'payments', 'purchases',
  'purchase_lines', 'manufacturing_runs', 'manufacturing_lines',
  'loyalty_transactions', 'print_settings', 'audit_log', 'invoice_attachments'
];

export function getFormatVersion () {
  return createVersion({ major: 1, minor: 0, patch: 0, label: 'apnabill-archive' });
}

function jsonEntry (name, value) {
  return { name, bytes: new TextEncoder().encode(JSON.stringify(value ?? null, null, 2)) };
}

/**
 * @param {object} snapshot the generate_company_backup_snapshot() jsonb result -- one key per table
 * @param {object} [meta] { companyId, generatedAt: ISO string, defaulting to now }
 * @returns {Uint8Array} a complete .apnabill archive (ZIP, STORE method)
 */
export function formatBackupArchive (snapshot, meta = {}) {
  const generatedAt = meta.generatedAt || new Date().toISOString();

  const manifest = {
    formatVersion: formatVersion(getFormatVersion()),
    companyId: meta.companyId ?? null,
    generatedAt,
    files: TABLE_KEYS.map(key => `${key}.json`)
  };

  const entries = [
    jsonEntry('manifest.json', manifest),
    ...TABLE_KEYS.map(key => jsonEntry(`${key}.json`, snapshot[key]))
  ];

  return buildZip(entries, new Date(generatedAt));
}

export function createApnaBillArchiveFormatterV1 () {
  return {
    getFormatVersion,
    format: (snapshot, meta) => formatBackupArchive(snapshot, meta)
  };
}
