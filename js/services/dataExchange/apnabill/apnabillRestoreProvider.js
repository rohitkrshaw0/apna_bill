// apnabill/apnabillRestoreProvider.js
// Implements 9A's restore/restoreContract.js IRestoreProvider for ApnaBill's
// own .apnabill format -- "New Company Restore" only (see restore_rpc.sql's
// own header comment for why Disaster Recovery Restore is a separate,
// not-yet-built mode):
//   validateVersion(version)              -- is this archive's format version one this engine understands
//   validateSchema(schema)                -- does the reconstructed snapshot have every expected table PRESENT
//   validateCompatibility(version, min)   -- thin wrapper over shared/version/compatibility.js
//   preview(backup)                       -- row counts per table, entirely offline, no DB read
//   restore(backup)                       -- calls restore_company_from_snapshot (restore_rpc.sql)
//   rollback()                            -- see below: a documented no-op for this restore mode
//
// FAIL-SAFE BY CONSTRUCTION: restore() re-validates (version + schema)
// itself, immediately, before doing anything else -- it does not trust that
// a caller already ran validateVersion()/validateSchema() first. If either
// check fails, restore() throws before even importing supabaseClient.js:
// no network call is attempted, nothing is written, not even an attempt is
// made. This means calling restore() directly (bypassing any future
// orchestration layer) is exactly as safe as going through one.
//
// ATOMICITY: restore_company_from_snapshot() is one plpgsql function body,
// which Postgres treats as one transaction -- any exception raised
// partway through unwinds every DELETE/INSERT it already made (see that
// file's own header comment). This provider adds no transaction logic of
// its own because there is exactly one RPC call and Postgres already
// guarantees all-or-nothing for it; there is no partial-state case for
// this file to handle.
//
// NEVER INFERS OR FABRICATES DATA: validateSchema() reports a missing
// table as an error naming it -- it never fills the gap with an empty
// array or any other default. A missing table is refused, not repaired.
//
// supabaseClient.js is imported dynamically, same reason as every other
// dataExchange reader/writer: importing this module must never require
// network access -- only actually calling restore() does. `opts.rpc` lets
// a caller replace the real RPC call entirely -- this milestone's own test
// harness injects a JS simulation of restore_rpc.sql's documented
// algorithm through it, since no live Postgres is reachable from this
// environment (see apnabill.test.html for exactly what that does and does
// not prove).

import { getFormatVersion } from './apnabillArchiveFormatterV1.js';
import { createValidationResult } from '../validators/validationResult.js';
import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CODES, ERROR_CATEGORY } from '../shared/errors/index.js';
import { SEVERITY } from '../shared/severity.js';
import { compareVersions, isCompatible, parseVersion } from '../shared/version/index.js';
import { createPreviewItem, createPreviewModel, PREVIEW_STATUS } from '../preview/index.js';

// Mirrors backup_rpc.sql's jsonb_build_object exactly (see
// apnabillArchiveFormatterV1.js's own copy of this list and its comment on
// why every copy of it is kept in lockstep).
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

async function defaultRpc (companyId, snapshot) {
  const { supa } = await import('../../../supabaseClient.js');
  const { error } = await supa.rpc('restore_company_from_snapshot', { _company_id: companyId, _snapshot: snapshot });
  if (error) throw error;
}

export function createApnaBillRestoreProvider (opts = {}) {
  const rpc = opts.rpc || defaultRpc;

  function validateVersion (version) {
    const errors = [];
    const warnings = [];
    const supported = getFormatVersion(); // 1.0.0-apnabill-archive -- the only version that has ever existed

    if (!version || typeof version.major !== 'number') {
      errors.push(createDataExchangeError({
        message: 'Archive manifest has no readable format version',
        code: ERROR_CODES.SCHEMA_MISMATCH, category: ERROR_CATEGORY.SCHEMA,
        source: 'apnabill/apnabillRestoreProvider'
      }));
      return createValidationResult({ errors, warnings });
    }

    if (version.major !== supported.major) {
      errors.push(createDataExchangeError({
        message: `Archive format major version ${version.major} is not supported -- this restore engine understands major version ${supported.major} only`,
        code: ERROR_CODES.SCHEMA_MISMATCH, category: ERROR_CATEGORY.SCHEMA,
        source: 'apnabill/apnabillRestoreProvider'
      }));
    } else if (!isCompatible(version, supported)) {
      errors.push(createDataExchangeError({
        message: 'Archive format version is older than the minimum this restore engine supports',
        code: ERROR_CODES.SCHEMA_MISMATCH, category: ERROR_CATEGORY.SCHEMA,
        source: 'apnabill/apnabillRestoreProvider'
      }));
    } else if (compareVersions(version, supported) > 0) {
      warnings.push(createDataExchangeError({
        message: 'Archive was produced by a newer minor/patch version than this restore engine was tested against',
        severity: SEVERITY.WARNING, category: ERROR_CATEGORY.SCHEMA,
        source: 'apnabill/apnabillRestoreProvider'
      }));
    }

    return createValidationResult({ errors, warnings });
  }

  /** @param {object} schema the reconstructed snapshot object -- "schema" here means "does this data have every table this format requires," not a DB DDL shape */
  function validateSchema (schema) {
    const errors = [];
    const snapshot = schema || {};
    for (const key of TABLE_KEYS) {
      if (!(key in snapshot)) {
        errors.push(createDataExchangeError({
          message: `Archive is missing table "${key}"`,
          code: ERROR_CODES.REFERENCE_NOT_FOUND, category: ERROR_CATEGORY.SCHEMA,
          entity: key, source: 'apnabill/apnabillRestoreProvider'
        }));
      }
    }
    return createValidationResult({ errors, warnings: [] });
  }

  function validateCompatibility (version, minCompatible) {
    return isCompatible(version, minCompatible);
  }

  /** Entirely offline -- no DB read. One PreviewItem per TABLE (not per row): every row is PREVIEW_STATUS.NEW by definition, since New Company Restore only ever targets an empty company. */
  function preview (backup) {
    const snapshot = (backup && backup.snapshot) || {};
    const items = TABLE_KEYS.map(key => createPreviewItem({
      entityType: key,
      status: PREVIEW_STATUS.NEW,
      dto: { table: key, rowCount: rowCount(snapshot[key]) }
    }));
    return createPreviewModel(items);
  }

  /** @param {{companyId: string, manifest: object, snapshot: object}} backup */
  async function restore (backup) {
    const { companyId, manifest, snapshot } = backup || {};
    if (!companyId) {
      throw createDataExchangeError({
        message: 'Restore requires a companyId',
        code: ERROR_CODES.REQUIRED_FIELD, category: ERROR_CATEGORY.SYSTEM,
        source: 'apnabill/apnabillRestoreProvider'
      });
    }

    // Fail-safe gate -- re-checked here regardless of what a caller already
    // did. Nothing past this point runs (not even the dynamic import of
    // supabaseClient.js in the real defaultRpc) unless both pass clean.
    const version = manifest && manifest.formatVersion ? parseVersion(manifest.formatVersion) : null;
    const combined = validateVersion(version).merge(validateSchema(snapshot));
    if (!combined.isValid()) {
      throw createDataExchangeError({
        message: `Restore refused: archive failed validation (${combined.toSummary()})`,
        code: ERROR_CODES.SCHEMA_MISMATCH, category: ERROR_CATEGORY.SCHEMA,
        source: 'apnabill/apnabillRestoreProvider'
      });
    }

    await rpc(companyId, snapshot);
    return { companyId, restoredAt: new Date().toISOString() };
  }

  /**
   * Documented no-op for New Company Restore. restore_company_from_snapshot()
   * is one Postgres transaction: it either commits everything or nothing,
   * before restore() above ever returns. By the time restore() has settled
   * (resolved or thrown), there is nothing left open at this layer to undo
   * -- a thrown error already means zero rows were touched; a resolved
   * promise already means everything committed durably. A real "undo an
   * already-completed restore" is a different, higher-blast-radius
   * operation (effectively a Disaster Recovery Restore run in reverse) and
   * is out of scope for the same reason that mode itself is.
   */
  function rollback () {}

  return { validateVersion, validateSchema, validateCompatibility, preview, restore, rollback };
}
