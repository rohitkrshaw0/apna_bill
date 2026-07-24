// transactions/transactionState.js
import { deepFreeze } from '../shared/freezeDeep.js';

export const TRANSACTION_STATE = deepFreeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  COMMITTED: 'committed',
  ROLLED_BACK: 'rolled_back',
  FAILED: 'failed'
});
