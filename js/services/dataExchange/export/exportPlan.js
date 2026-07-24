// export/exportPlan.js
// The export-side blueprint: which entities, in what order, with what
// options. Simpler than ImportPlan by design -- the export pipeline
// (Database -> Exporter -> DTO -> Formatter -> Output) has no conflict or
// preview stage, so this doesn't invent one.

import { deepFreeze } from '../shared/freezeDeep.js';

export function createExportPlan ({ entities = [], order = [], options = {} } = {}) {
  const plan = deepFreeze({ entities, order, options });
  return { ...plan, describe: () => `Export plan: ${entities.length} entity type(s) [${order.join(' -> ')}]` };
}
