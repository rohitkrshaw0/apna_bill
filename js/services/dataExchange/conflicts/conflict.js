// conflicts/conflict.js
// A generic conflict record -- nothing entity-specific. `resolveConflict`
// returns a *new* object with `resolution` set, rather than mutating, so
// conflicts stay consistent with the DTO layer's immutable-by-default style.

import { deepFreeze } from '../shared/freezeDeep.js';

export function createConflict ({ entityType, existingRecord, incomingRecord, recommendedAction = null, reason = null } = {}) {
  return deepFreeze({ entityType, existingRecord, incomingRecord, recommendedAction, reason, resolution: null });
}

export function resolveConflict (conflict, action) {
  return deepFreeze({ ...conflict, resolution: action });
}
