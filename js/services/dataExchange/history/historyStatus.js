// history/historyStatus.js
import { deepFreeze } from '../shared/freezeDeep.js';

export const HISTORY_STATUS = deepFreeze({
  PENDING: 'pending',
  SUCCESS: 'success',
  PARTIAL: 'partial',
  FAILED: 'failed'
});
