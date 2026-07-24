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
//                               DTO -> Formatter -> Output. As of Milestone
//                               9F Phase 2, this sequencing is delegated to
//                               the Migration Engine -- see runXmlExport()'s
//                               own comment below for exactly how.
//
// buildXmlExportPlan() and createXmlExporter() are UNCHANGED by this
// migration -- both are still directly callable/testable independently,
// exactly as before.

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
 * -> Output. As of Milestone 9F Phase 2, sequencing (validation gating,
 * progress reporting, history-entry generation) is delegated to
 * createMigrationEngine().run() -- this function now only describes
 * export's shape as a MigrationAdapter: "read" means buildPlan() (defaults
 * to buildXmlExportPlan, itself unchanged) followed immediately by the
 * exporter's own prepare/export/finalize (unconditional, exactly as
 * before -- exporter.export() already defensively returns [] when invalid,
 * so nothing here duplicates that check), "validate" reuses the plan's
 * own already-computed validationResult (passed through the engine's
 * validators mechanism rather than recomputed), and "write" means
 * formatter.format() -- which, gated by the engine on validity, only runs
 * when the plan validated cleanly, exactly as the original `isValid ?
 * await formatter.format(...) : null` did.
 *
 * `formatter`/`exporter` remain injectable (default to the real ones), the
 * same testability pattern 9B's createXmlImporter({writers}) established.
 * `buildPlan` and `engine` are newly injectable for the same reason --
 * buildXmlExportPlan() reaches live Supabase, so an offline test needs to
 * substitute it exactly as it already substitutes formatter/exporter.
 */
export async function runXmlExport (opts = {}) {
  const engine = opts.engine || createMigrationEngine();
  const formatter = opts.formatter || createTallyXmlFormatterV1();
  const exporter = opts.exporter || createXmlExporter();
  const buildPlan = opts.buildPlan || buildXmlExportPlan;

  // Captured via closure -- EXPORT-specific legacy return fields (`dtos`,
  // `summary`, `companyDto`) that no other adapter needs.
  let capturedDtos = [];
  let capturedSummary = { recordCount: 0 };
  let capturedCompanyDto = null;

  const adapter = createBaseMigrationAdapter({
    source: {
      read: async () => {
        const plan = await buildPlan(opts);
        capturedCompanyDto = plan.companyDto;
        // Unconditional, exactly as before: exporter.export() itself
        // returns [] when plan.validationResult is invalid, so this needs
        // no separate validity check here.
        exporter.prepare({ exportModel: plan.exportModel, validationResult: plan.validationResult });
        capturedDtos = exporter.export();
        capturedSummary = exporter.finalize();
        return plan;
      }
    },
    validators: [
      // Passes the plan's own already-computed validationResult straight
      // through the engine's validators mechanism, rather than
      // recomputing one -- buildXmlExportPlan() already ran the full
      // requiredFieldsRule/dateFormatRule/gstRateCrossCheckRule/
      // duplicateNameWithinBatchRule/referencedEntitiesRule pipeline
      // (via runValidation() above, unchanged) before this function ever
      // sees the plan.
      { validate: (dtoList) => dtoList[0].validationResult }
    ],
    transform: { fromDTO: (dtoList) => dtoList[0] },
    sink: {
      write: async (unit) => formatter.format(unit.exportModel)
    },
    executionMode: EXECUTION_MODES.SINGLE_SHOT,
    rollbackStrategy: ROLLBACK_STRATEGIES.NONE,
    estimateChanges: () => ({ count: capturedDtos.length }),
    historyType: 'export'
  });

  const migrationResult = await engine.run(adapter);

  return {
    xml: migrationResult.executionOutput,
    dtos: capturedDtos,
    summary: capturedSummary,
    validationResult: migrationResult.validationResult,
    progressTracker: migrationResult.progressTracker,
    historyEntry: migrationResult.historyEntry,
    companyDto: capturedCompanyDto
  };
}
