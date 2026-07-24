// migration/migrationEngine.js
// The Migration Engine core (Milestone 9F, approved design §6/§9): the one
// orchestrator every current and future data-movement pipeline runs on top
// of. Coordinates existing, UNCHANGED shared infrastructure --
// validators/validationPipeline.js, conflicts/conflictEngine.js,
// shared/dependencyGraph.js, progress/progressTracker.js,
// history/historyEntry.js, and (via rollbackStrategies.js)
// transactions/transactionEngine.js -- it introduces no new business rule
// and re-implements none of those pieces.
//
// Data flow (approved design §9), identical regardless of direction:
//   source.read() -> transform.toDTO() -> ValidationPipeline(validators)
//   -> ConflictEngine(detectors) -> preview() -> DependencyGraph(edges)
//   -> MigrationPlan
//   -> [pre-verify, if declared] -> (if valid) Execute (per-unit or
//      single-shot, via the chosen RollbackStrategy) -> [post-verify]
//   -> HistoryEntry + MigrationResult (every thrown value normalized,
//      cancellation checked at both boundaries below)
//
// This file is purely additive: nothing existing imports it yet, and it
// imports nothing that isn't already a stable, unmodified piece of this
// platform.

import { assertValidMigrationAdapter, EXECUTION_MODES, ROLLBACK_STRATEGIES } from './migrationAdapter.js';
import { createMigrationPlan } from './migrationPlan.js';
import { createMigrationResult } from './migrationResult.js';
import { createLifoRollbackStrategy, createDelegatedRollbackStrategy, createNoRollbackStrategy } from './rollbackStrategies.js';
import { normalizeError } from './errorNormalization.js';
import { createValidationPipeline } from '../validators/validationPipeline.js';
import { createValidationResult } from '../validators/validationResult.js';
import { createConflictEngine } from '../conflicts/conflictEngine.js';
import { createDependencyGraph } from '../shared/dependencyGraph.js';
import { createProgressTracker } from '../progress/index.js';
import { createHistoryEntry, HISTORY_STATUS } from '../history/index.js';

function pickRollbackStrategy (name, opts) {
  switch (name) {
    case ROLLBACK_STRATEGIES.LIFO: return createLifoRollbackStrategy(opts);
    case ROLLBACK_STRATEGIES.DELEGATED: return createDelegatedRollbackStrategy();
    case ROLLBACK_STRATEGIES.NONE:
    default: return createNoRollbackStrategy();
  }
}

/** Cancellation hook (approved design §9 note, generalizing apnabillRestore.js's
 *  pre-existing, restore-only pattern to every adapter): checked only at stage
 *  boundaries, not mid-write -- the same explicitly-partial scope 9E's own hook has. */
function throwIfCancelled (signal) {
  if (signal && signal.aborted) {
    const err = new Error('Migration was cancelled before completion');
    err.cancelled = true;
    throw err;
  }
}

function buildOrder (dependencyEdges, entityTypes) {
  if (!dependencyEdges || !dependencyEdges.length) return entityTypes || [];
  const graph = createDependencyGraph();
  for (const node of (entityTypes || [])) graph.addNode(node);
  for (const [node, dependsOn] of dependencyEdges) graph.addEdge(node, dependsOn);
  return graph.topologicalOrder();
}

async function runPerUnit (adapter, dtoList, context, progressTracker, rollbackStrategy) {
  progressTracker.update({ totalRecords: dtoList.length, currentRecord: 0, successCount: 0, failureCount: 0 });
  const outputs = [];
  let failed = false;

  for (const dto of dtoList) {
    try {
      const unit = adapter.transform?.fromDTO ? adapter.transform.fromDTO(dto) : dto;
      const written = await adapter.sink.write(unit, context);
      outputs.push(written);

      if (adapter.rollbackStrategy === ROLLBACK_STRATEGIES.LIFO && adapter.undo) {
        rollbackStrategy.registerRollbackStep(() => adapter.undo(written, dto));
      }
      const snap = progressTracker.snapshot();
      progressTracker.update({ currentRecord: (snap.currentRecord || 0) + 1, successCount: (snap.successCount || 0) + 1 });
    } catch (err) {
      failed = true;
      rollbackStrategy.collectErrors(normalizeError(err, 'migration/migrationEngine'));
      const snap = progressTracker.snapshot();
      progressTracker.update({ currentRecord: (snap.currentRecord || 0) + 1, failureCount: (snap.failureCount || 0) + 1 });
      break; // no migration is ever left partially applied -- rollback() below undoes everything written so far
    }
  }

  if (failed) rollbackStrategy.rollback(); else rollbackStrategy.commit();
  return outputs;
}

async function runSingleShot (adapter, dtoList, context, progressTracker, rollbackStrategy) {
  progressTracker.update({ totalRecords: 1, currentRecord: 0, successCount: 0, failureCount: 0 });
  try {
    const unit = adapter.transform?.fromDTO ? adapter.transform.fromDTO(dtoList) : dtoList;
    const output = await adapter.sink.write(unit, context);
    rollbackStrategy.commit();
    progressTracker.update({ currentRecord: 1, successCount: 1 });
    return output;
  } catch (err) {
    rollbackStrategy.collectErrors(normalizeError(err, 'migration/migrationEngine'));
    rollbackStrategy.rollback();
    progressTracker.update({ currentRecord: 1, failureCount: 1 });
    return null;
  }
}

export function createMigrationEngine () {
  /**
   * @param {import('./migrationAdapter.js').MigrationAdapter} adapter
   * @param {object} [opts] { context, existingRecords, signal, logger }
   * @returns {Promise<ReturnType<typeof createMigrationResult>>}
   */
  async function run (adapter, opts = {}) {
    assertValidMigrationAdapter(adapter);

    const startedAt = Date.now();
    const context = opts.context || {};
    const progressTracker = createProgressTracker();
    const rollbackStrategy = pickRollbackStrategy(adapter.rollbackStrategy, { logger: opts.logger });

    let plan = null;
    let validationResult = createValidationResult();
    let previewModel = null;
    let executionOutput = null;
    let cancelled = false;
    let executed = false;

    try {
      throwIfCancelled(opts.signal);

      // ---- Plan phase ----
      const raw = await adapter.source.read(context);
      const dtos = adapter.transform?.toDTO ? adapter.transform.toDTO(raw) : raw;
      const dtoList = Array.isArray(dtos) ? dtos : [dtos];

      if (adapter.validators?.length) {
        validationResult = createValidationPipeline(adapter.validators).run(dtoList, context);
      }

      let conflicts = [];
      if (adapter.detectors?.length) {
        conflicts = createConflictEngine({ detectors: adapter.detectors }).detect(opts.existingRecords || [], dtoList);
      }

      if (adapter.preview) {
        previewModel = adapter.preview(dtoList, conflicts, validationResult);
      }

      const order = buildOrder(adapter.dependencyEdges, adapter.entityTypes);

      plan = createMigrationPlan({
        order,
        dependencies: adapter.dependencyEdges || [],
        validationResult,
        conflicts,
        previewModel,
        estimatedChanges: adapter.estimateChanges ? adapter.estimateChanges(dtoList) : { count: dtoList.length }
      });

      if (adapter.verify && adapter.verifyTiming === 'pre') {
        validationResult = validationResult.merge(adapter.verify(dtoList));
      }

      // ---- Execute phase (only if everything so far is valid) ----
      if (validationResult.isValid()) {
        throwIfCancelled(opts.signal);
        rollbackStrategy.begin();
        executed = true;

        executionOutput = adapter.executionMode === EXECUTION_MODES.PER_UNIT
          ? await runPerUnit(adapter, dtoList, context, progressTracker, rollbackStrategy)
          : await runSingleShot(adapter, dtoList, context, progressTracker, rollbackStrategy);

        validationResult = validationResult.merge(createValidationResult({
          errors: rollbackStrategy.getErrors(),
          warnings: rollbackStrategy.getWarnings()
        }));
      }

      // ---- Post-execution verify (default timing) ----
      if (adapter.verify && adapter.verifyTiming !== 'pre') {
        validationResult = validationResult.merge(adapter.verify(executionOutput));
      }
    } catch (err) {
      if (err && err.cancelled) {
        cancelled = true;
        validationResult = validationResult.merge(createValidationResult({
          warnings: [normalizeError(err, 'migration/migrationEngine')]
        }));
      } else {
        validationResult = validationResult.merge(createValidationResult({
          errors: [normalizeError(err, 'migration/migrationEngine')]
        }));
      }
    }

    const isSuccess = !cancelled && executed && validationResult.isValid();

    const historyEntry = createHistoryEntry({
      type: adapter.historyType || 'migration',
      timestamp: startedAt,
      durationMs: Date.now() - startedAt,
      recordCount: plan?.estimatedChanges?.count ?? 0,
      warnings: validationResult.warnings,
      errors: validationResult.errors,
      status: isSuccess ? HISTORY_STATUS.SUCCESS : HISTORY_STATUS.FAILED
    });

    return createMigrationResult({
      plan, executionOutput, validationResult, previewModel, historyEntry, progressTracker, cancelled,
      details: { executionMode: adapter.executionMode, rollbackStrategy: adapter.rollbackStrategy || ROLLBACK_STRATEGIES.NONE }
    });
  }

  return { run };
}
