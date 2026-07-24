// migration/migrationPlan.js
// The Migration Engine's one canonical plan shape (Milestone 9F, approved
// design §8/§16), replacing the four ad hoc shapes that exist today:
// import/importPlan.js's createImportPlan() (actually used by
// xmlImporter.js), export/exportPlan.js's createExportPlan() (NEVER called
// anywhere -- confirmed by grep, also flagged in 9C's own architecture
// audit), and backup/restore's plain options objects (no plan concept at
// all). Deliberately mirrors createImportPlan()'s own shape and
// deep-freeze convention exactly -- this is that same idea, generalized,
// not a new one.
//
// Neither import/importPlan.js nor export/exportPlan.js is modified or
// removed by this file's existence -- see the design doc's §18 Phase 3
// note: deprecating those is an explicitly deferred, separate decision.

import { deepFreeze } from '../shared/freezeDeep.js';

export function createMigrationPlan ({
  order = [], dependencies = [], validationResult = null, conflicts = [],
  previewModel = null, estimatedChanges = {}
} = {}) {
  const plan = deepFreeze({ order, dependencies, validationResult, conflicts, previewModel, estimatedChanges });
  return { ...plan, describe: () => `Migration plan: ${order.length} module(s) in order [${order.join(' -> ')}]` };
}
