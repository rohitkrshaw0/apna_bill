// services/dataExchange/migration/index.js -- public barrel for the Migration Engine (Milestone 9F).
export {
  assertValidMigrationAdapter, createBaseMigrationAdapter, EXECUTION_MODES, ROLLBACK_STRATEGIES
} from './migrationAdapter.js';
export { createMigrationPlan } from './migrationPlan.js';
export { createMigrationResult } from './migrationResult.js';
export {
  createLifoRollbackStrategy, createDelegatedRollbackStrategy, createNoRollbackStrategy
} from './rollbackStrategies.js';
export { normalizeError, isAlreadyNormalizedError } from './errorNormalization.js';
export { createMigrationEngine } from './migrationEngine.js';
