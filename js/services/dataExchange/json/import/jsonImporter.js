// json/import/jsonImporter.js
// Orchestrates the full canonical-JSON -> ApnaBill import pipeline, mirroring
// xml/xmlImporter.js's own split. This is an adapter layer only -- every
// write reuses an existing, frozen business function (createItem/
// createPartyQuick/createSupplier/saveSaleFromCart/writeOpeningBalance/
// writeOpeningStock, the last two reused unchanged from xml/writers/, see
// milestone-10-json-design.md section 3).
//
// Two halves, matching xmlImporter.js's own pipeline diagram:
//   buildJsonImportPlan()  -- validate envelope -> parse to DTOs -> validate
//                             business rules -> conflict -> preview ->
//                             dependency order (everything before any write
//                             happens; this is the confirmation gate)
//   createJsonImporter()   -- IImporter: executes a prepared plan's DTOs
//                             through the Migration Engine, LIFO rollback on
//                             the first failure

import { createJsonParserV1 } from './jsonParserV1.js';
import {
  requiredFieldsRule, dateFormatRule, gstRateCrossCheckRule, referencedEntitiesRule
} from '../rules/jsonBusinessRules.js';
import {
  duplicateItemNameDetector, duplicateLedgerNameDetector, duplicateInvoiceNumberDetector
} from '../../xml/conflicts/xmlConflictDetectors.js';

import { createBusinessValidator, createReferenceValidator } from '../../validators/index.js';
import { createValidationPipeline } from '../../validators/validationPipeline.js';
import { createConflictEngine } from '../../conflicts/conflictEngine.js';
import { createPreviewItem, createPreviewModel, PREVIEW_STATUS } from '../../preview/index.js';
import { createDependencyGraph } from '../../shared/dependencyGraph.js';
import { createImportPlan } from '../../import/importPlan.js';
import { createDataExchangeError } from '../../shared/errors/dataExchangeError.js';
import { ERROR_CATEGORY } from '../../shared/errors/index.js';
import { SEVERITY } from '../../shared/severity.js';
import { ENTITY_TYPES, DEPENDENCY_EDGES } from '../shared/entityManifest.js';
import {
  createBaseMigrationAdapter, EXECUTION_MODES, ROLLBACK_STRATEGIES, createMigrationEngine
} from '../../migration/index.js';

// The real writers below reach js/items.js, js/sales.js, js/suppliers.js --
// which all import supabaseClient.js, which imports the Supabase SDK from a
// remote CDN. Dynamic import() defers that cost until a real writer
// actually runs, same reasoning xmlImporter.js's own realWriterDeps() gives.
async function realWriterDeps () {
  const [items, sales, suppliers, openingBalance, openingStock] = await Promise.all([
    import('../../../../items.js'),
    import('../../../../sales.js'),
    import('../../../../suppliers.js'),
    import('../../xml/writers/openingBalanceWriter.js'),
    import('../../xml/writers/openingStockWriter.js')
  ]);
  return { ...items, ...sales, ...suppliers, ...openingBalance, ...openingStock };
}

function normalizeName (s) { return String(s ?? '').trim().toLowerCase(); }

// ---------------------------------------------------------------------
// buildJsonImportPlan -- validate/parse/validate-business/conflict/preview/order
// ---------------------------------------------------------------------

/**
 * @param {string|ArrayBuffer|object} source JSON text, bytes, or an already-parsed envelope
 * @param {object} opts { existingItems, existingParties (customers+suppliers), existingInvoices }
 */
export async function buildJsonImportPlan (source, opts = {}) {
  const existingItems = opts.existingItems || [];
  const existingParties = opts.existingParties || [];
  const existingInvoices = opts.existingInvoices || [];

  const parser = createJsonParserV1();
  const structuralCheck = parser.validate(source);
  if (!structuralCheck.isValid()) {
    return {
      plan: null, resolvedDtos: [], validationResult: structuralCheck,
      conflicts: [], previewModel: createPreviewModel([]),
      metadata: parser.getMetadata(), warnings: parser.getWarnings(),
      companyDTO: null
    };
  }

  const dtos = parser.parse(source);
  const metadata = parser.getMetadata();

  const itemDtos = dtos.filter(d => d.__dtoType === 'item');
  const customerDtos = dtos.filter(d => d.__dtoType === 'customer');
  const supplierDtos = dtos.filter(d => d.__dtoType === 'supplier');
  const saleDtos = dtos.filter(d => d.__dtoType === 'sale');

  const knownItemNames = new Set([
    ...existingItems.map(i => i.name),
    ...itemDtos.map(d => d.name)
  ]);

  const pipeline = createValidationPipeline([
    createBusinessValidator({ rules: [requiredFieldsRule, dateFormatRule, gstRateCrossCheckRule] }),
    createReferenceValidator({ rules: [referencedEntitiesRule] })
  ]);
  const validationResult = pipeline.run(dtos, { knownItemNames });

  const itemConflicts = createConflictEngine({ detectors: [duplicateItemNameDetector] })
    .detect(existingItems, itemDtos);
  const partyConflicts = createConflictEngine({ detectors: [duplicateLedgerNameDetector] })
    .detect(existingParties, [...customerDtos, ...supplierDtos]);
  const saleConflicts = createConflictEngine({ detectors: [duplicateInvoiceNumberDetector] })
    .detect(existingInvoices, saleDtos);
  const conflicts = [...itemConflicts, ...partyConflicts, ...saleConflicts];

  const previewItems = dtos.map(dto => buildPreviewItem(dto, conflicts, validationResult));
  const previewModel = createPreviewModel(previewItems);

  const graph = createDependencyGraph();
  for (const node of ENTITY_TYPES) graph.addNode(node);
  for (const [node, dependsOn] of DEPENDENCY_EDGES) graph.addEdge(node, dependsOn);
  const order = graph.topologicalOrder();

  const byType = {
    item: itemDtos.map(dto => ({ entityType: 'item', dto, extra: dto.meta?.opening || null })),
    customer: customerDtos.map(dto => ({ entityType: 'customer', dto, extra: { openingBalance: dto.meta?.openingBalance || 0 } })),
    supplier: supplierDtos.map(dto => ({ entityType: 'supplier', dto, extra: { openingBalance: dto.meta?.openingBalance || 0 } })),
    sale: saleDtos.map(dto => ({ entityType: 'sale', dto, extra: null }))
  };
  const resolvedDtos = order.flatMap(type => byType[type] || []);

  const estimatedChanges = {
    items: itemDtos.length, customers: customerDtos.length,
    suppliers: supplierDtos.length, sales: saleDtos.length
  };

  const plan = createImportPlan({
    order,
    dependencies: DEPENDENCY_EDGES,
    validationState: validationResult,
    conflictSummary: { count: conflicts.length, byType: { item: itemConflicts.length, party: partyConflicts.length, sale: saleConflicts.length } },
    estimatedChanges
  });

  return {
    plan, resolvedDtos, validationResult, conflicts, previewModel,
    metadata, warnings: [...parser.getWarnings(), ...(metadata.envelopeWarnings || [])],
    parserErrors: parser.getErrors(),
    companyDTO: metadata.company || null
  };
}

function buildPreviewItem (dto, conflicts, validationResult) {
  const conflict = conflicts.find(c => c.incomingRecord === dto) || null;
  const key = dto.__dtoType === 'sale' ? dto.invoiceNo : dto.name;
  const matches = (e) => e.entity === dto.__dtoType && key && e.message.includes(String(key));
  const errors = validationResult.errors.filter(matches);
  const warnings = validationResult.warnings.filter(matches);
  const status = conflict ? PREVIEW_STATUS.DUPLICATE : (errors.length ? PREVIEW_STATUS.INVALID : PREVIEW_STATUS.NEW);
  return createPreviewItem({ entityType: dto.__dtoType, status, dto, warnings, errors, conflict });
}

// ---------------------------------------------------------------------
// createJsonImporter -- IImporter: executes resolvedDtos via the Migration Engine
// ---------------------------------------------------------------------

const defaultWriters = {
  item: {
    write: async (dto, extra) => {
      const { createItem, writeOpeningStock } = await realWriterDeps();
      const row = await createItem({
        name: dto.name, code: dto.code, kind: dto.kind, unit: dto.unit,
        hsn_sac: dto.hsnSac, gst_rate: dto.gstRate, cess_rate: dto.cessRate,
        track_stock: dto.trackStock, track_batches: dto.trackBatches
      });
      await writeOpeningStock({ itemId: row.id, trackBatches: dto.trackBatches, openingQty: extra?.qty ?? 0, batches: extra?.batches || [] });
      return row;
    },
    undo: async (row) => { const { deleteItemHard } = await realWriterDeps(); deleteItemHard(row.id).catch(() => {}); }
  },
  customer: {
    write: async (dto, extra) => {
      const { createPartyQuick, writeOpeningBalance } = await realWriterDeps();
      const row = await createPartyQuick({ name: dto.name, phone: dto.phone, gstin: dto.gstin, state_code: dto.stateCode, address: dto.address });
      if (extra?.openingBalance) await writeOpeningBalance(row.id, extra.openingBalance);
      return row;
    },
    // customers/suppliers share the `parties` table (see suppliers.js) --
    // setSupplierActive is a plain is_active flip on that table either way.
    undo: async (row) => { const { setSupplierActive } = await realWriterDeps(); setSupplierActive(row.id, false).catch(() => {}); }
  },
  supplier: {
    write: async (dto, extra) => {
      const { createSupplier, writeOpeningBalance } = await realWriterDeps();
      const row = await createSupplier({ name: dto.name, phone: dto.phone, gstin: dto.gstin, state_code: dto.stateCode, address: dto.address });
      if (extra?.openingBalance) await writeOpeningBalance(row.id, extra.openingBalance);
      return row;
    },
    undo: async (row) => { const { setSupplierActive } = await realWriterDeps(); setSupplierActive(row.id, false).catch(() => {}); }
  },
  sale: {
    write: async (dto, extra, ctx) => {
      const { saveSaleFromCart } = await realWriterDeps();
      return saveSaleFromCart({
        seller_state_code: ctx.sellerStateCode,
        party: dto.__party || null,
        lines: dto.lines,
        invoice_date: dto.invoiceDate,
        round_off_mode: 'nearest',
        payment: dto.payment
      });
    },
    // No voidSale/deleteSale exists anywhere in the app today -- same
    // documented, deliberate no-op xmlImporter.js's own sale writer has.
    undo: () => {}
  }
};

// A sale DTO's customerId / a line's item_id are the SOURCE company's real
// database ids -- meaningless (or silently wrong) against a different
// target company, which is exactly the cross-instance scenario JSON exists
// to support. Resolution is always BY NAME (dto.meta.partyName / line.
// item_name) against the target company's existing records first, then
// whatever this batch itself just created -- see
// milestone-10-json-design.md section 8 for the full rationale. The
// original id/customerId/item_id fields are preserved on the DTO for
// round-trip fidelity only; never trusted here.
function resolveSaleReferences (dto, createdByType, existingParties, existingItems) {
  const partyName = dto.meta?.partyName || null;
  let party = null;
  if (partyName) {
    const created = createdByType.customer.get(partyName) || createdByType.supplier.get(partyName);
    if (created) {
      party = { id: created.id };
    } else {
      const existing = existingParties.find(p => normalizeName(p.name) === normalizeName(partyName));
      if (existing) party = { id: existing.id };
    }
  }

  const lines = dto.lines.map(line => {
    if (!line.item_name) return line;
    const created = createdByType.item.get(line.item_name);
    if (created) {
      return { ...line, item_id: created.id, hsn_sac: line.hsn_sac || created.hsn_sac, unit: line.unit || created.unit, gst_rate: created.gst_rate, cess_rate: created.cess_rate };
    }
    const existing = existingItems.find(i => normalizeName(i.name) === normalizeName(line.item_name));
    if (existing) return { ...line, item_id: existing.id };
    return line;
  });

  return { ...dto, __party: party, lines };
}

/**
 * Implements 9A's import/importerContract.js IImporter. run()'s internal
 * sequencing (per-record execute loop, LIFO-rollback registration, progress
 * updates, history-entry generation) is delegated to the Migration Engine --
 * this function only describes import's execution shape as a
 * MigrationAdapter, mirroring createXmlImporter().run() exactly:
 * executionMode 'per-unit', rollbackStrategy 'lifo'.
 *
 * run(plan, {transactionEngine, progressTracker})'s signature matches
 * import/importerContract.js's IImporter exactly, same reason
 * xmlImporter.js's does -- both are passed straight through to the engine so
 * a caller's transactionEngine.getState() reflects ROLLED_BACK/COMMITTED
 * reality.
 *
 * No validation self-gate in run() itself, matching xmlImporter.js's own
 * documented behavior: buildJsonImportPlan()'s validationResult remains the
 * sole gate, a caller's responsibility to check before calling run().
 */
export function createJsonImporter ({ writers = defaultWriters, existingParties = [], existingItems = [] } = {}) {
  let context = {};
  let resolvedDtos = [];
  let result = { createdIds: {}, errors: [], warnings: [], historyEntry: null };

  function prepare (ctx = {}) {
    context = ctx;
    resolvedDtos = ctx.resolvedDtos || [];
    result = { createdIds: {}, errors: [], warnings: [], historyEntry: null };
  }

  async function run (plan, { transactionEngine, progressTracker, engine } = {}) {
    const createdByType = { item: new Map(), customer: new Map(), supplier: new Map() };
    const knownParties = context.existingParties || existingParties;
    const knownItems = context.existingItems || existingItems;

    const adapter = createBaseMigrationAdapter({
      source: { read: async () => resolvedDtos },
      sink: {
        write: async (entry) => {
          const writerDef = writers[entry.entityType];
          if (!writerDef) {
            throw createDataExchangeError({
              message: `No writer registered for entity type "${entry.entityType}"`,
              category: ERROR_CATEGORY.SYSTEM, severity: SEVERITY.ERROR, entity: entry.entityType, source: 'json/jsonImporter'
            });
          }

          const dto = entry.entityType === 'sale' ? resolveSaleReferences(entry.dto, createdByType, knownParties, knownItems) : entry.dto;

          let row;
          try {
            row = await writerDef.write(dto, entry.extra, context);
          } catch (e) {
            throw createDataExchangeError({
              message: e?.message || String(e),
              category: ERROR_CATEGORY.SYSTEM, severity: SEVERITY.ERROR, entity: entry.entityType, source: 'json/jsonImporter'
            });
          }

          if (createdByType[entry.entityType]) createdByType[entry.entityType].set(entry.dto.name, row);
          return { entityType: entry.entityType, row };
        }
      },
      executionMode: EXECUTION_MODES.PER_UNIT,
      rollbackStrategy: ROLLBACK_STRATEGIES.LIFO,
      undo: (written) => { writers[written.entityType]?.undo?.(written.row); },
      estimateChanges: () => ({ count: resolvedDtos.length }),
      historyType: 'import'
    });

    const migrationEngineInstance = engine || createMigrationEngine();
    const migrationResult = await migrationEngineInstance.run(adapter, { transactionEngine, progressTracker });

    const createdIds = {};
    for (const written of (migrationResult.executionOutput || [])) {
      createdIds[written.entityType] = createdIds[written.entityType] || [];
      createdIds[written.entityType].push(written.row.id ?? written.row.invoice_id ?? null);
    }

    result = {
      createdIds,
      errors: migrationResult.validationResult.errors,
      warnings: migrationResult.validationResult.warnings,
      historyEntry: migrationResult.historyEntry
    };
    return result;
  }

  function getResult () { return result; }

  return { prepare, run, getResult };
}
