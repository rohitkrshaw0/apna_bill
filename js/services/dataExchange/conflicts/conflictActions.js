// conflicts/conflictActions.js
// The resolution actions a future UI/importer can choose for any conflict,
// regardless of entity type.

import { deepFreeze } from '../shared/freezeDeep.js';

export const CONFLICT_ACTIONS = deepFreeze({
  SKIP: 'skip',
  REPLACE: 'replace',
  MERGE: 'merge',
  RENAME: 'rename',
  CANCEL: 'cancel'
});
