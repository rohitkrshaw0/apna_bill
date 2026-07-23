// preview/previewItem.js
// One record's preview entry -- its classified status, the DTO it came
// from, any warnings/errors collected against it, and its conflict if one
// was detected. Nothing here imports anything; preview is read-only.

import { deepFreeze } from '../shared/freezeDeep.js';

export function createPreviewItem ({ entityType, status, dto, warnings = [], errors = [], conflict = null } = {}) {
  return deepFreeze({ entityType, status, dto, warnings, errors, conflict });
}
