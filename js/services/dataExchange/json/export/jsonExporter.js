// json/export/jsonExporter.js
// Orchestrates the full ApnaBill -> canonical JSON export pipeline, mirroring
// xml/export/xmlExporter.js's own split:
//   buildJsonExportPlan()  -- read -> map to DTOs -> validate (the "planning"
//                             phase; nothing is formatted until validation
//                             passes)
//   createJsonExporter()   -- implements 9A's exporters/contract.js
//                             IExporter (prepare/export/finalize)
//   runJsonExport()        -- the export/ orchestration layer: Database ->
//                             Exporter -> DTO -> Formatter -> Output,
//                             delegated to the Migration Engine exactly like
//                             runXmlExport() already is.
//
// Unlike XML (two separate "kind"s -- master/vouchers), JSON export produces
// ALL requested entity types (item/customer/supplier/sale) in ONE file by
// default -- this is what "JSON is the canonical interchange format, not
// another export format" (the milestone brief) means in practice: a single
// file that already IS the whole company, or a caller-selected subset of it
// (opts.scope === 'entities' + opts.entities), never a format-imposed split.
//
// Data reads and DTO mapping are reused UNCHANGED from xml/export/ -- see
// milestone-10-json-design.md section 3 for why this is safe (both are
// self-declared ERP-agnostic in their own header comments).

import { fetchAllItems, fetchAllParties, fetchOpeningStockForItem, fetchSalesInvoices } from '../../xml/export/dataReaders.js';
import { mapFirmToCompanyDTO } from '../../xml/export/mapping/masters/companyExportMapper.js';
import { mapItemToExportDTO } from '../../xml/export/mapping/masters/itemExportMapper.js';
import { mapPartyToExportDTOs } from '../../xml/export/mapping/masters/partyExportMapper.js';
import { mapInvoiceToSaleDTO } from '../../xml/export/mapping/vouchers/salesVoucherExportMapper.js';
import {
  requiredFieldsRule, dateFormatRule, gstRateCrossCheckRule, referencedEntitiesRule, duplicateNameWithinBatchRule
} from '../rules/jsonBusinessRules.js';
import { createBusinessValidator, createReferenceValidator } from '../../validators/index.js';
import { createValidationPipeline } from '../../validators/validationPipeline.js';
import { ENTITY_TYPES } from '../shared/entityManifest.js';
import { createJsonFormatterV1 } from './jsonFormatterV1.js';
import {
  createBaseMigrationAdapter, EXECUTION_MODES, ROLLBACK_STRATEGIES, createMigrationEngine
} from '../../migration/index.js';

function runValidation (dtoList, context) {
  const pipeline = createValidationPipeline([
    createBusinessValidator({ rules: [requiredFieldsRule, dateFormatRule, gstRateCrossCheckRule, duplicateNameWithinBatchRule] }),
    createReferenceValidator({ rules: [referencedEntitiesRule] })
  ]);
  return pipeline.run(dtoList, context);
}

async function readCurrentUserEmail () {
  try {
    const { supa } = await import('../../../../supabaseClient.js');
    const { data } = await supa.auth.getUser();
    return data?.user?.email || null;
  } catch {
    return null; // offline/unavailable -- never fabricated, see design doc section 5
  }
}

/**
 * @param {object} opts { scope: 'company'|'entities', entities: string[], activeOnly, firmId, dateFrom, dateTo }
 */
export async function buildJsonExportPlan (opts = {}) {
  const scope = opts.scope === 'entities' ? 'entities' : 'company';
  const requestedEntities = scope === 'entities' ? (opts.entities || []).filter(t => ENTITY_TYPES.includes(t)) : ENTITY_TYPES.slice();
  const wants = (type) => requestedEntities.includes(type);

  // Dynamic imports -- see dataReaders.js's own header comment: nothing that
  // merely imports this module should require network access, only
  // actually calling buildJsonExportPlan() does.
  const { getActiveFirm, getActiveCompanyId } = await import('../../../../supabaseClient.js');
  const firm = await getActiveFirm();
  const companyDto = firm ? mapFirmToCompanyDTO(firm) : null;
  const exportedBy = await readCurrentUserEmail();

  const byType = { item: [], customer: [], supplier: [], sale: [] };

  if (wants('item')) {
    const itemRows = await fetchAllItems(opts);
    for (const item of itemRows) {
      const opening = await fetchOpeningStockForItem(item.id);
      const { dto, openingQty, openingUnit, batches } = mapItemToExportDTO(item, opening);
      // JSON has no separate "opening stock" sibling channel the way the
      // mapper's own return shape does (xmlFormatterV1 reads the sibling
      // directly) -- a flat, single-object-per-record file needs this
      // folded into the record itself, or it would be silently lost on
      // export (the "never fabricate OR discard real data" principle cuts
      // both ways). meta is already this DTO's designated open extension
      // bag (see itemExportMapper.js's own centralTax/stateTax/
      // integratedTax precedent) -- this does not touch itemDTO.js itself.
      byType.item.push({ ...dto, meta: { ...dto.meta, opening: { qty: openingQty, unit: openingUnit, batches } } });
    }
  }

  if (wants('customer') || wants('supplier')) {
    const partyRows = await fetchAllParties(opts);
    for (const party of partyRows) {
      for (const { dto, openingBalance } of mapPartyToExportDTOs(party)) {
        const withOpening = { ...dto, meta: { ...dto.meta, openingBalance } };
        if (dto.__dtoType === 'customer' && wants('customer')) byType.customer.push(withOpening);
        if (dto.__dtoType === 'supplier' && wants('supplier')) byType.supplier.push(withOpening);
      }
    }
  }

  if (wants('sale')) {
    const invoiceRows = await fetchSalesInvoices(opts);
    for (const { invoice, lines } of invoiceRows) byType.sale.push(mapInvoiceToSaleDTO(invoice, lines).dto);
  }

  const allDtos = ENTITY_TYPES.flatMap(t => byType[t]);
  const knownItemNames = new Set([...(byType.item.map(d => d.name))]);
  const validationResult = runValidation(allDtos, { knownItemNames });

  return {
    scope, requestedEntities, companyDto, byType, validationResult,
    exportModel: {
      companyDto,
      byType,
      warnings: validationResult.warnings,
      meta: {
        companyId: getActiveCompanyId(),
        exportedBy,
        scope,
        requestedEntities: scope === 'entities' ? requestedEntities : null
      }
    }
  };
}

/** Implements 9A's exporters/contract.js IExporter. Produces DTOs only -- never calls a formatter. */
export function createJsonExporter () {
  let context = {};
  let dtos = [];

  function prepare (ctx = {}) {
    context = ctx; // { exportModel, validationResult }
    dtos = [];
  }

  function doExport () {
    const { exportModel, validationResult } = context;
    if (validationResult && !validationResult.isValid()) return [];
    dtos = ENTITY_TYPES.flatMap(t => (exportModel.byType[t] || []));
    return dtos;
  }

  function finalize () {
    return { recordCount: dtos.length };
  }

  return { prepare, export: doExport, finalize };
}

/**
 * The export/ orchestration layer: Database -> Exporter -> DTO -> Formatter
 * -> Output. Sequencing (validation gating, progress reporting,
 * history-entry generation) is delegated to createMigrationEngine().run(),
 * exactly mirroring runXmlExport() -- see that function's own header
 * comment for the shape this reproduces.
 *
 * @param {object} opts buildJsonExportPlan()'s own opts, plus:
 *   { pretty: boolean, formatter, exporter, buildPlan, engine } -- all injectable,
 *   same offline-testability convention as runXmlExport().
 */
export async function runJsonExport (opts = {}) {
  const engine = opts.engine || createMigrationEngine();
  const formatter = opts.formatter || createJsonFormatterV1();
  const exporter = opts.exporter || createJsonExporter();
  const buildPlan = opts.buildPlan || buildJsonExportPlan;

  let capturedDtos = [];
  let capturedSummary = { recordCount: 0 };
  let capturedCompanyDto = null;
  let capturedEnvelope = null;

  const adapter = createBaseMigrationAdapter({
    source: {
      read: async () => {
        const plan = await buildPlan(opts);
        capturedCompanyDto = plan.companyDto;
        exporter.prepare({ exportModel: plan.exportModel, validationResult: plan.validationResult });
        capturedDtos = exporter.export();
        capturedSummary = exporter.finalize();
        return plan;
      }
    },
    validators: [
      { validate: (dtoList) => dtoList[0].validationResult }
    ],
    transform: { fromDTO: (dtoList) => dtoList[0] },
    sink: {
      write: async (unit) => {
        const result = formatter.format(unit.exportModel, { pretty: opts.pretty !== false });
        capturedEnvelope = result.envelope;
        return result;
      }
    },
    executionMode: EXECUTION_MODES.SINGLE_SHOT,
    rollbackStrategy: ROLLBACK_STRATEGIES.NONE,
    estimateChanges: () => ({ count: capturedDtos.length }),
    historyType: 'export'
  });

  const migrationResult = await engine.run(adapter);

  return {
    json: migrationResult.executionOutput?.json ?? null,
    bytes: migrationResult.executionOutput?.bytes ?? null,
    envelope: capturedEnvelope,
    dtos: capturedDtos,
    summary: capturedSummary,
    validationResult: migrationResult.validationResult,
    progressTracker: migrationResult.progressTracker,
    historyEntry: migrationResult.historyEntry,
    companyDto: capturedCompanyDto
  };
}
