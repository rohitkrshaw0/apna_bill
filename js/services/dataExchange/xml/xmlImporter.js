// xml/xmlImporter.js
// Orchestrates the full Tally-XML import pipeline on top of 9A's engines,
// and implements 9A's import/importerContract.js IImporter for the
// execute-and-rollback half of it. This is an adapter layer only -- every
// write reuses an existing, frozen business function (createItem/
// createPartyQuick/createSupplier/saveSaleFromCart); the only genuinely new
// write logic is the opening-balance/opening-stock writers (see writers/).
//
// Two halves, matching the plan's pipeline diagram:
//   buildXmlImportPlan()  -- parse -> map -> validate -> conflict -> preview
//                             -> dependency order (everything before any
//                             write happens; this is the confirmation gate)
//   createXmlImporter()   -- IImporter: executes a prepared plan's DTOs
//                             through 9A's TransactionEngine, LIFO rollback
//                             on the first failure

import { createTallyXmlParser } from './tallyXmlParser.js';
import { createGroupClassifier } from './mapping/groupClassifier.js';
import { mapStockItemRecord } from './mapping/masters/itemMapper.js';
import { mapLedgerRecord } from './mapping/masters/partyMapper.js';
import { mapCompanyRecord } from './mapping/masters/companyMapper.js';
import { createVoucherDispatcher } from './mapping/vouchers/voucherDispatcher.js';
import { mapSalesVoucherRecord, BY_NAME_PREFIX } from './mapping/vouchers/salesVoucherMapper.js';
import {
  requiredFieldsRule, dateFormatRule, quantitySplitRule,
  gstRateCrossCheckRule, ledgerBalanceRule, referencedEntitiesRule
} from './validators/xmlBusinessRules.js';
import {
  duplicateItemNameDetector, duplicateLedgerNameDetector, duplicateInvoiceNumberDetector
} from './conflicts/xmlConflictDetectors.js';

import { createBusinessValidator, createReferenceValidator } from '../validators/index.js';
import { createValidationPipeline } from '../validators/validationPipeline.js';
import { createConflictEngine } from '../conflicts/conflictEngine.js';
import { createPreviewItem, createPreviewModel, PREVIEW_STATUS } from '../preview/index.js';
import { createDependencyGraph } from '../shared/dependencyGraph.js';
import { createImportPlan } from '../import/importPlan.js';
import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CATEGORY } from '../shared/errors/index.js';
import { SEVERITY } from '../shared/severity.js';
import {
  createBaseMigrationAdapter, EXECUTION_MODES, ROLLBACK_STRATEGIES, createMigrationEngine
} from '../migration/index.js';

// The real writers below reach js/items.js, js/sales.js, js/suppliers.js --
// which all import supabaseClient.js, which imports the Supabase SDK from a
// remote CDN. Importing those statically here would make loading this
// module (and anything that imports it, including the fully-offline test
// page) require network access even when the caller supplies its own fake
// writers and never touches the real ones. Dynamic import() defers that
// cost until a real writer actually runs.
async function realWriterDeps () {
  const [items, sales, suppliers, openingBalance, openingStock] = await Promise.all([
    import('../../items.js'),
    import('../../sales.js'),
    import('../../suppliers.js'),
    import('./writers/openingBalanceWriter.js'),
    import('./writers/openingStockWriter.js')
  ]);
  return { ...items, ...sales, ...suppliers, ...openingBalance, ...openingStock };
}

function normalizeName (s) { return String(s ?? '').trim().toLowerCase(); }

// ---------------------------------------------------------------------
// buildXmlImportPlan -- parse/map/validate/conflict/preview/order
// ---------------------------------------------------------------------

/**
 * @param {string|ArrayBuffer|{buffer,fileName}} source
 * @param {object} opts { existingItems, existingParties (customers), existingInvoices }
 */
export async function buildXmlImportPlan (source, opts = {}) {
  const existingItems = opts.existingItems || [];
  const existingParties = opts.existingParties || [];
  const existingInvoices = opts.existingInvoices || [];

  const parser = createTallyXmlParser();
  const structuralCheck = parser.validate(source);
  if (!structuralCheck.isValid()) {
    return {
      plan: null, resolvedDtos: [], validationResult: structuralCheck,
      conflicts: [], previewModel: createPreviewModel([]),
      metadata: parser.getMetadata(), warnings: parser.getWarnings(),
      companyDTO: null
    };
  }

  const records = await parser.parse(source);
  const mappingWarnings = [];

  const groupRecords = records.filter(r => r.__xmlTag === 'GROUP');
  const stockItemRecords = records.filter(r => r.__xmlTag === 'STOCKITEM');
  const ledgerRecords = records.filter(r => r.__xmlTag === 'LEDGER');
  const companyRecords = records.filter(r => r.__xmlTag === 'COMPANY');
  const voucherRecords = records.filter(r => r.__xmlTag === 'VOUCHER');

  const classifier = createGroupClassifier(groupRecords);

  const itemMappings = stockItemRecords.map(mapStockItemRecord);
  for (const m of itemMappings) mappingWarnings.push(...m.warnings);

  const ledgerMappings = ledgerRecords.map(r => mapLedgerRecord(r, { classifier }));
  const customerMappings = ledgerMappings.filter(m => m.role === 'customer');
  const supplierMappings = ledgerMappings.filter(m => m.role === 'supplier');
  const unsupportedLedgers = ledgerMappings.filter(m => m.role === 'unsupported');
  for (const u of unsupportedLedgers) {
    mappingWarnings.push({ message: `LEDGER "${u.name}" (group "${u.parent || '?'}") has no ApnaBill-equivalent role -- skipped` });
  }

  const companyDTO = companyRecords.length ? mapCompanyRecord(companyRecords[0]) : null;

  const existingCustomerIndex = new Map(existingParties.map(p => [normalizeName(p.name), p.id]));
  function resolveCustomerId (name) { return existingCustomerIndex.get(normalizeName(name)) || null; }

  const dispatcher = createVoucherDispatcher();
  dispatcher.register('Sales', (record, ctx) => mapSalesVoucherRecord(record, ctx));

  const saleMappings = [];
  for (const v of voucherRecords) {
    const result = dispatcher.dispatch(v.__vchType, v, { resolveCustomerId });
    if (!result.supported) {
      mappingWarnings.push({ message: `VOUCHER VCHTYPE="${v.__vchType}" is not a supported voucher type -- skipped (only Sales is implemented; see mapping doc section 7.4)` });
      continue;
    }
    saleMappings.push(result);
    mappingWarnings.push(...result.warnings);
  }

  const allDtos = [
    ...itemMappings.map(m => m.dto),
    ...customerMappings.map(m => m.dto),
    ...supplierMappings.map(m => m.dto),
    ...saleMappings.map(m => m.dto)
  ];

  const knownItemNames = new Set([
    ...existingItems.map(i => i.name),
    ...itemMappings.map(m => m.dto.name)
  ]);

  const pipeline = createValidationPipeline([
    createBusinessValidator({ rules: [requiredFieldsRule, dateFormatRule, quantitySplitRule, gstRateCrossCheckRule, ledgerBalanceRule] }),
    createReferenceValidator({ rules: [referencedEntitiesRule] })
  ]);
  const validationResult = pipeline.run(allDtos, { knownItemNames });

  const itemConflicts = createConflictEngine({ detectors: [duplicateItemNameDetector] })
    .detect(existingItems, itemMappings.map(m => m.dto));
  const partyConflicts = createConflictEngine({ detectors: [duplicateLedgerNameDetector] })
    .detect(existingParties, [...customerMappings.map(m => m.dto), ...supplierMappings.map(m => m.dto)]);
  const saleConflicts = createConflictEngine({ detectors: [duplicateInvoiceNumberDetector] })
    .detect(existingInvoices, saleMappings.map(m => m.dto));
  const conflicts = [...itemConflicts, ...partyConflicts, ...saleConflicts];

  const previewItems = allDtos.map(dto => buildPreviewItem(dto, conflicts, validationResult));
  for (const u of unsupportedLedgers) {
    previewItems.push(createPreviewItem({
      entityType: 'ledger', status: PREVIEW_STATUS.IGNORED, dto: null,
      warnings: [{ message: `LEDGER "${u.name}" skipped -- no ApnaBill-equivalent role` }], errors: [], conflict: null
    }));
  }
  const previewModel = createPreviewModel(previewItems);

  const graph = createDependencyGraph();
  for (const node of ['item', 'customer', 'supplier', 'sale']) graph.addNode(node);
  graph.addEdge('sale', 'item');
  graph.addEdge('sale', 'customer');
  graph.addEdge('sale', 'supplier');
  const order = graph.topologicalOrder();

  const byType = {
    item: itemMappings.map(m => ({ entityType: 'item', dto: m.dto, extra: { openingQty: m.openingQty, batches: m.batches } })),
    customer: customerMappings.map(m => ({ entityType: 'customer', dto: m.dto, extra: { openingBalance: m.openingBalance } })),
    supplier: supplierMappings.map(m => ({ entityType: 'supplier', dto: m.dto, extra: { openingBalance: m.openingBalance } })),
    sale: saleMappings.map(m => ({ entityType: 'sale', dto: m.dto, extra: null }))
  };
  const resolvedDtos = order.flatMap(type => byType[type] || []);

  const estimatedChanges = {
    items: itemMappings.length, customers: customerMappings.length,
    suppliers: supplierMappings.length, sales: saleMappings.length,
    ignoredLedgers: unsupportedLedgers.length
  };

  const plan = createImportPlan({
    order,
    dependencies: [['sale', 'item'], ['sale', 'customer'], ['sale', 'supplier']],
    validationState: validationResult,
    conflictSummary: { count: conflicts.length, byType: { item: itemConflicts.length, party: partyConflicts.length, sale: saleConflicts.length } },
    estimatedChanges
  });

  return {
    plan, resolvedDtos, validationResult, conflicts, previewModel,
    metadata: parser.getMetadata(),
    warnings: [...parser.getWarnings(), ...mappingWarnings],
    parserErrors: parser.getErrors(),
    companyDTO
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
// createXmlImporter -- IImporter: executes resolvedDtos via TransactionEngine
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
      await writeOpeningStock({ itemId: row.id, trackBatches: dto.trackBatches, openingQty: extra?.openingQty ?? 0, batches: extra?.batches || [] });
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
    // No voidSale/deleteSale exists anywhere in the app today -- a committed
    // sale genuinely cannot be auto-reversed. Flagged, not silently no-op'd:
    // a failure *after* a sale write leaves that one invoice needing manual
    // reversal, same as every other business screen in this app today.
    undo: () => {}
  }
};

function resolveSaleReferences (dto, createdByType) {
  let party = null;
  if (typeof dto.customerId === 'string' && dto.customerId.startsWith(BY_NAME_PREFIX)) {
    party = createdByType.customer.get(dto.customerId.slice(BY_NAME_PREFIX.length)) || null;
  } else if (dto.customerId) {
    party = { id: dto.customerId };
  }
  const lines = dto.lines.map(line => {
    if (line.item_id) return line;
    const created = line.item_name ? createdByType.item.get(line.item_name) : null;
    if (!created) return line;
    return {
      ...line, item_id: created.id,
      hsn_sac: line.hsn_sac || created.hsn_sac,
      unit: line.unit || created.unit,
      gst_rate: created.gst_rate, cess_rate: created.cess_rate
    };
  });
  return { ...dto, __party: party, lines };
}

/**
 * Implements 9A's import/importerContract.js IImporter. As of Milestone 9F
 * Phase 2, run()'s internal sequencing (the per-record execute loop,
 * LIFO-rollback registration, progress updates, history-entry generation)
 * is delegated to the Migration Engine -- this function now only
 * describes import's execution shape as a MigrationAdapter: "read" means
 * the resolvedDtos prepare() already stored (already topologically
 * ordered by buildXmlImportPlan() -- no re-ordering happens here), "write"
 * means dispatching to the registered writer for each entry's entityType
 * (resolving sale->item/customer/supplier references first, exactly as
 * before), and rollbackStrategy is 'lifo' -- but see run()'s own opts
 * below for why the ENGINE's own lifo strategy is never actually
 * constructed here.
 *
 * run(plan, {transactionEngine, progressTracker})'s signature is UNCHANGED
 * -- required by the IImporter contract, and by every existing caller
 * (xmlImport.test.html always supplies both explicitly). Both are passed
 * straight through to the engine, which uses them AS the actual
 * progressTracker/rollback-strategy instances instead of constructing its
 * own -- this is what lets a caller's `transactionEngine.getState()`
 * still reflect ROLLED_BACK/COMMITTED correctly, and is the one small,
 * additive capability the engine gained specifically for this migration
 * (see migrationEngine.js's own comment on `opts.transactionEngine`/
 * `opts.progressTracker`).
 *
 * Import still has NO validation self-gate, unchanged: no `validators` are
 * declared on this adapter, so the engine's default (empty, always-valid)
 * validationResult means execution always proceeds -- exactly matching
 * the pre-migration behavior, where run() never checked validity at all
 * (that gate has only ever existed in buildXmlImportPlan()'s own preview/
 * validationResult, which a caller is expected to inspect before ever
 * calling run() -- unchanged by this migration).
 */
export function createXmlImporter ({ writers = defaultWriters } = {}) {
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

    const adapter = createBaseMigrationAdapter({
      source: { read: async () => resolvedDtos },
      sink: {
        write: async (entry) => {
          const writerDef = writers[entry.entityType];
          if (!writerDef) {
            throw createDataExchangeError({
              message: `No writer registered for entity type "${entry.entityType}"`,
              category: ERROR_CATEGORY.SYSTEM, severity: SEVERITY.ERROR, entity: entry.entityType, source: 'xml/xmlImporter'
            });
          }

          const dto = entry.entityType === 'sale' ? resolveSaleReferences(entry.dto, createdByType) : entry.dto;

          let row;
          try {
            row = await writerDef.write(dto, entry.extra, context);
          } catch (e) {
            throw createDataExchangeError({
              message: e?.message || String(e),
              category: ERROR_CATEGORY.SYSTEM, severity: SEVERITY.ERROR, entity: entry.entityType, source: 'xml/xmlImporter'
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
