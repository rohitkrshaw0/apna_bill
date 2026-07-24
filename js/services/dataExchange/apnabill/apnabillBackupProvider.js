// apnabill/apnabillBackupProvider.js
// Implements 9A's backup/backupContract.js IBackupProvider for ApnaBill's
// own .apnabill format:
//   prepare(context)  -- records which company to back up
//   backup(context)   -- calls generate_company_backup_snapshot (backup_rpc.sql),
//                         then hands the result to apnabillArchiveFormatterV1.js
//                         to produce the final ZIP bytes
//   verify(result)    -- checks the archive is well-formed BEFORE anything is
//                         handed to a destination -- never trusts its own output blind
//   finalize()        -- reports what got backed up (table row counts, byte size)
//
// Never talks to a destination itself -- "where the bytes go" is a separate
// concern entirely, see backupDestinationContract.js's own header comment.
//
// supabaseClient.js is imported dynamically, same reason as every other
// dataExchange reader/writer (dataReaders.js, openingStockWriter.js, ...):
// importing this module must never require network access -- only actually
// calling backup() does.

import { formatBackupArchive } from './apnabillArchiveFormatterV1.js';
import { readZip } from './zip/zipReader.js';
import { createValidationResult } from '../validators/validationResult.js';
import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CODES, ERROR_CATEGORY } from '../shared/errors/index.js';
import { SEVERITY } from '../shared/severity.js';

// Mirrors backup_rpc.sql's jsonb_build_object exactly (see
// apnabillArchiveFormatterV1.js's own copy of this list and its comment on
// why the two are kept in lockstep).
const TABLE_KEYS = [
  'company', 'firms', 'parties', 'items', 'item_custom_field_defs',
  'item_custom_field_values', 'batches', 'stock_ledger', 'payment_types',
  'invoice_prefixes', 'invoices', 'invoice_lines', 'payments', 'purchases',
  'purchase_lines', 'manufacturing_runs', 'manufacturing_lines',
  'loyalty_transactions', 'print_settings', 'audit_log', 'invoice_attachments'
];

function rowCount (value) {
  if (Array.isArray(value)) return value.length;
  return value ? 1 : 0;
}

export function createApnaBillBackupProvider () {
  let context = {};
  let result = null;

  function prepare (ctx = {}) {
    context = ctx; // { companyId }
    result = null;
  }

  async function backup (ctx = context) {
    context = ctx;
    const { supa, getActiveCompanyId } = await import('../../../supabaseClient.js');
    const companyId = context.companyId || getActiveCompanyId();
    if (!companyId) {
      throw createDataExchangeError({
        message: 'Backup provider requires a companyId',
        code: ERROR_CODES.REQUIRED_FIELD,
        category: ERROR_CATEGORY.SYSTEM,
        source: 'apnabill/apnabillBackupProvider'
      });
    }

    const { data: snapshot, error } = await supa.rpc('generate_company_backup_snapshot', { _company_id: companyId });
    if (error) throw error;

    const generatedAt = new Date().toISOString();
    const bytes = formatBackupArchive(snapshot, { companyId, generatedAt });

    result = { bytes, snapshot, companyId, generatedAt };
    return result;
  }

  /** @param {{bytes: Uint8Array, snapshot: object}} [candidate] defaults to the last backup() result */
  function verify (candidate = result) {
    const errors = [];
    const warnings = [];

    if (!candidate || !(candidate.bytes instanceof Uint8Array) || candidate.bytes.length === 0) {
      errors.push(createDataExchangeError({
        message: 'Backup archive is empty or missing',
        code: ERROR_CODES.INVALID_VALUE, category: ERROR_CATEGORY.SYSTEM,
        source: 'apnabill/apnabillBackupProvider'
      }));
      return createValidationResult({ errors, warnings });
    }

    // Real structural verification -- parses the central directory and
    // re-checks every entry's CRC-32, not just a signature byte at offset 0.
    // A corrupted middle byte, a truncated file, or an unsupported
    // compression method is now genuinely caught, not just a well-formed
    // header on garbage data.
    let archiveEntries = null;
    try {
      archiveEntries = readZip(candidate.bytes);
    } catch (err) {
      errors.push(createDataExchangeError({
        message: `Backup archive failed structural verification: ${err.message}`,
        code: ERROR_CODES.SCHEMA_MISMATCH, category: ERROR_CATEGORY.SYSTEM,
        source: 'apnabill/apnabillBackupProvider'
      }));
    }
    const archiveNames = new Set((archiveEntries || []).map(e => e.name));

    if (archiveEntries && !archiveNames.has('manifest.json')) {
      errors.push(createDataExchangeError({
        message: 'Backup archive is missing manifest.json',
        code: ERROR_CODES.REFERENCE_NOT_FOUND, category: ERROR_CATEGORY.SYSTEM,
        source: 'apnabill/apnabillBackupProvider'
      }));
    }

    const snapshot = candidate.snapshot || {};
    for (const key of TABLE_KEYS) {
      if (!(key in snapshot)) {
        errors.push(createDataExchangeError({
          message: `Backup snapshot is missing table "${key}"`,
          code: ERROR_CODES.REFERENCE_NOT_FOUND, category: ERROR_CATEGORY.SYSTEM,
          entity: key, source: 'apnabill/apnabillBackupProvider'
        }));
      }
      if (archiveEntries && !archiveNames.has(`${key}.json`)) {
        errors.push(createDataExchangeError({
          message: `Backup archive is missing the file for table "${key}"`,
          code: ERROR_CODES.REFERENCE_NOT_FOUND, category: ERROR_CATEGORY.SYSTEM,
          entity: key, source: 'apnabill/apnabillBackupProvider'
        }));
      }
    }

    if (!snapshot.company) {
      warnings.push(createDataExchangeError({
        message: 'Backup snapshot has no company record',
        severity: SEVERITY.WARNING, category: ERROR_CATEGORY.SYSTEM,
        entity: 'company', source: 'apnabill/apnabillBackupProvider'
      }));
    }

    return createValidationResult({ errors, warnings });
  }

  function finalize () {
    if (!result) return {};
    const { snapshot, companyId, generatedAt, bytes } = result;
    return {
      companyId,
      generatedAt,
      byteLength: bytes.length,
      tableCounts: Object.fromEntries(TABLE_KEYS.map(key => [key, rowCount(snapshot[key])]))
    };
  }

  return { prepare, backup, verify, finalize };
}
