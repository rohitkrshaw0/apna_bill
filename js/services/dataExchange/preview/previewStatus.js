// preview/previewStatus.js
// The status every previewed record is classified as, before anything is
// actually imported.

import { deepFreeze } from '../shared/freezeDeep.js';

export const PREVIEW_STATUS = deepFreeze({
  FOUND: 'found',
  NEW: 'new',
  EXISTING: 'existing',
  DUPLICATE: 'duplicate',
  INVALID: 'invalid',
  IGNORED: 'ignored'
});
