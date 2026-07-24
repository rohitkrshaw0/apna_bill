// import/importPlan.js
// The blueprint built before anything is imported -- order, dependencies,
// validation/conflict state, and estimated changes. An Importer (see
// importerContract.js) executes against this plan; nothing imports directly.

import { deepFreeze } from '../shared/freezeDeep.js';

export function createImportPlan ({
  order = [], dependencies = [], validationState = null, conflictSummary = null, estimatedChanges = {}
} = {}) {
  const plan = deepFreeze({ order, dependencies, validationState, conflictSummary, estimatedChanges });
  return { ...plan, describe: () => `Import plan: ${order.length} module(s) in order [${order.join(' -> ')}]` };
}
