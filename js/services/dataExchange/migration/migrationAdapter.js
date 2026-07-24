// migration/migrationAdapter.js
// The Migration Engine's one contract (Milestone 9F, per the approved
// design in docs/milestone-9f-migration-engine-design.md §8): capability-
// based, not one mandatory interface. Only source/sink/executionMode are
// required -- everything else (transform, validators, detectors,
// dependencyEdges, verify, preview, rollbackStrategy, undo) is a capability
// an adapter may or may not have, exactly mirroring how
// backup/backupDestinationContract.js already makes download/list/delete
// optional on IBackupDestination.
//
// @typedef {Object} MigrationAdapter
// @property {{read: function(context): Promise<any>}} source
// @property {{write: function(unit, context): Promise<any>}} sink
// @property {'per-unit'|'single-shot'} executionMode
// @property {{toDTO: function(raw): any, fromDTO: function(dto): any}} [transform]
// @property {object[]} [validators]      -- pre-built stage validator instances (e.g.
//                                            createBusinessValidator({rules})), run in
//                                            order via validators/validationPipeline.js
// @property {function[]} [detectors]     -- conflict detectors, run via conflicts/conflictEngine.js
// @property {[string,string][]} [dependencyEdges]  -- [node, dependsOn] pairs
// @property {string[]} [entityTypes]     -- node list for dependencyEdges' graph
// @property {function(dtoList): object}  [preview]  -- builds a PreviewModel
// @property {function(any): ValidationResult} [verify]
// @property {'pre'|'post'} [verifyTiming]  -- default 'post'
// @property {'lifo'|'delegated'|'none'} [rollbackStrategy]  -- default 'none'
// @property {function(writtenUnit, dto): void} [undo]  -- only used when rollbackStrategy is 'lifo'
// @property {function(dtoList): object} [estimateChanges]
// @property {string} [historyType]       -- default 'migration'

import { deepFreeze } from '../shared/freezeDeep.js';
import { createDataExchangeError } from '../shared/errors/dataExchangeError.js';
import { ERROR_CODES, ERROR_CATEGORY } from '../shared/errors/index.js';

export const EXECUTION_MODES = deepFreeze({ PER_UNIT: 'per-unit', SINGLE_SHOT: 'single-shot' });
export const ROLLBACK_STRATEGIES = deepFreeze({ LIFO: 'lifo', DELEGATED: 'delegated', NONE: 'none' });

export function assertValidMigrationAdapter (candidate) {
  const missing = [];
  if (!candidate?.source || typeof candidate.source.read !== 'function') missing.push('source.read');
  if (!candidate?.sink || typeof candidate.sink.write !== 'function') missing.push('sink.write');
  if (!candidate?.executionMode) missing.push('executionMode');

  if (missing.length) {
    throw createDataExchangeError({
      message: `Migration adapter is missing required field(s): ${missing.join(', ')}`,
      code: ERROR_CODES.INVALID_CONTRACT,
      category: ERROR_CATEGORY.SYSTEM,
      source: 'migration/migrationAdapter'
    });
  }
  return true;
}

/** Default-stub factory, same convention as every other contract's createBaseX() (e.g. backupContract.js's createBaseBackupProvider()). */
export function createBaseMigrationAdapter (overrides = {}) {
  return {
    source: { read: () => { throw new Error('source.read() not implemented'); } },
    sink: { write: () => { throw new Error('sink.write() not implemented'); } },
    executionMode: EXECUTION_MODES.SINGLE_SHOT,
    rollbackStrategy: ROLLBACK_STRATEGIES.NONE,
    ...overrides
  };
}
