// shared/severity.js
// Shared severity levels, consumed by both the Error System and the
// Validation Pipeline so a single scale (not two) runs through the framework.

import { deepFreeze } from './freezeDeep.js';

export const SEVERITY = deepFreeze({
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
});
