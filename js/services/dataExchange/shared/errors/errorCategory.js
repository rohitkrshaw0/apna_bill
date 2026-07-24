// shared/errors/errorCategory.js
// Generic error categories, matching the Validation Pipeline's stages
// (File/Schema/Business/Relationship/Reference/Duplicate/Conflict) plus a
// catch-all for framework-level failures (e.g. a dependency cycle).

import { deepFreeze } from '../freezeDeep.js';

export const ERROR_CATEGORY = deepFreeze({
  FILE: 'file',
  SCHEMA: 'schema',
  BUSINESS: 'business',
  RELATIONSHIP: 'relationship',
  REFERENCE: 'reference',
  DUPLICATE: 'duplicate',
  CONFLICT: 'conflict',
  SYSTEM: 'system'
});
