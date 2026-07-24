// xml/export/xmlExporter.js
// Orchestrates the full ApnaBill -> Tally XML export pipeline, mirroring
// 9B's xmlImporter.js split:
//   buildXmlExportPlan()  -- read -> map to DTOs -> validate (the "planning"
//                             phase; nothing is formatted until validation
//                             passes)
//   createXmlExporter()   -- implements 9A's exporters/contract.js
//                             IExporter (prepare/export/finalize) -- per
//                             that contract's own header comment, an
//                             Exporter produces DTOs only; turning a DTO
//                             into output text is a Formatter's job, called
//                             by the orchestration layer below, never by
//                             the exporter itself.
//   runXmlExport()          -- the "export/ orchestration layer" the 9A
//                               contracts describe: Database -> Exporter ->
//                               DTO -> Formatter -> Output.

import { fetchAllItems, fetchAllParties, fetchOpeningStockForItem, fetchSalesInvoices } from './dataReaders.js';
import { mapFirmToCompanyDTO } from './mapping/masters/companyExportMapper.js';
import { mapItemToExportDTO } from './mapping/masters/itemExportMapper.js';
import { mapPartyToExportDTOs } from './mapping/masters/partyExportMapper.js';
import { mapInvoiceToSaleDTO } from './mapping/vouchers/salesVoucherExportMapper.js';
import {
  requiredFieldsRule, dateFormatRule, gstRateCrossCheckRule, referencedEntitiesRule, duplicateNameWithinBatchRule
} from './validators/xmlExportRules.js';
import { createBusinessValidator, createReferenceValidator } from '../../validators/index.js';
import { createValidationPipeline } from '../../validators/validationPipeline.js';
import { createTallyXmlFormatterV1 } from './tallyXmlFormatterV1.js';
import { createProgressTracker } from '../../progress/index.js';
import { createHistoryEntry, HISTORY_STATUS } from '../../history/index.js';

function runValidation (dtoList, context) {
  const pipeline = createValidationPipeline([
    createBusinessValidator({ rules: [requiredFieldsRule, dateFormatRule, gstRateCrossCheckRule, duplicateNameWithinBatchRule] }),
    createReferenceValidator({ rules: [referencedEntitiesRule] })
  ]);
  return pipeline.run(dtoList, context);
}

/**
 * @param {object} opts { kind: 'master'|'vouchers', activeOnly, firmId, dateFrom, dateTo }
 */
export async function buildXmlExportPlan (opts = {}) {
  const kind = opts.kind === 'vouchers' ? 'vouchers' : 'master';
  // Dynamic import -- see dataReaders.js's header comment: nothing that
  // merely imports this module should require network access to the
  // Supabase CDN, only actually calling buildXmlExportPlan() should.
  const { getActiveFirm } = await import('../../../../supabaseClient.js');
  const firm = await getActiveFirm();
  const companyDto = firm ? mapFirmToCompanyDTO(firm) : null;

  if (kind === 'master') {
    const itemRows = await fetchAllItems(opts);
    const itemMappings = [];
    for (const item of itemRows) {
      const opening = await fetchOpeningStockForItem(item.id);
      itemMappings.push(mapItemToExportDTO(item, opening));
    }

    const partyRows = await fetchAllParties(opts);
    const partyMappings = partyRows.flatMap(mapPartyToExportDTOs);

    const allDtos = [...itemMappings.map(m => m.dto), ...partyMappings.map(m => m.dto)];
    const validationResult = runValidation(allDtos, { knownItemNames: new Set(itemMappings.map(m => m.dto.name)) });

    return {
      kind, companyDto, items: itemMappings, parties: partyMappings, validationResult,
      exportModel: { kind: 'master', company: companyDto, items: itemMappings, parties: partyMappings }
    };
  }

  const invoiceRows = await fetchSalesInvoices(opts);
  const saleMappings = invoiceRows.map(({ invoice, lines }) => mapInvoiceToSaleDTO(invoice, lines));
  const knownItems = await fetchAllItems({ activeOnly: false });
  const allDtos = saleMappings.map(m => m.dto);
  const validationResult = runValidation(allDtos, { knownItemNames: new Set(knownItems.map(i => i.name)) });

  return {
    kind, companyDto, sales: saleMappings, validationResult,
    exportModel: { kind: 'vouchers', company: companyDto, sales: saleMappings }
  };
}

/** Implements 9A's exporters/contract.js IExporter. Produces DTOs only -- never calls a formatter. */
export function createXmlExporter () {
  let context = {};
  let dtos = [];

  function prepare (ctx = {}) {
    context = ctx; // { exportModel, validationResult }
    dtos = [];
  }

  function doExport () {
    const { exportModel, validationResult } = context;
    if (validationResult && !validationResult.isValid()) return [];
    dtos = exportModel.kind === 'vouchers'
      ? (exportModel.sales || []).map(s => s.dto)
      : [...(exportModel.items || []).map(i => i.dto), ...(exportModel.parties || []).map(p => p.dto)];
    return dtos;
  }

  function finalize () {
    return { recordCount: dtos.length };
  }

  return { prepare, export: doExport, finalize };
}

/**
 * The export/ orchestration layer: Database -> Exporter -> DTO -> Formatter
 * -> Output. `formatter`/`exporter` are injectable (default to the real
 * ones) so tests can substitute fakes, exactly mirroring 9B's
 * createXmlImporter({writers}) pattern one layer over.
 */
export async function runXmlExport (opts = {}) {
  const startedAt = Date.now();
  const plan = await buildXmlExportPlan(opts);
  const formatter = opts.formatter || createTallyXmlFormatterV1();
  const exporter = opts.exporter || createXmlExporter();

  exporter.prepare({ exportModel: plan.exportModel, validationResult: plan.validationResult });
  const dtos = exporter.export();
  const summary = exporter.finalize();

  const isValid = plan.validationResult.isValid();
  const progressTracker = createProgressTracker();
  progressTracker.update({
    totalRecords: dtos.length, currentRecord: dtos.length,
    successCount: isValid ? dtos.length : 0, failureCount: isValid ? 0 : dtos.length
  });

  const xml = isValid ? await formatter.format(plan.exportModel) : null;

  const historyEntry = createHistoryEntry({
    type: 'export', timestamp: startedAt, durationMs: Date.now() - startedAt,
    recordCount: dtos.length, warnings: plan.validationResult.warnings, errors: plan.validationResult.errors,
    status: isValid ? HISTORY_STATUS.SUCCESS : HISTORY_STATUS.FAILED
  });

  return { xml, dtos, summary, validationResult: plan.validationResult, progressTracker, historyEntry, companyDto: plan.companyDto };
}
