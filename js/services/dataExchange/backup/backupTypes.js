// backup/backupTypes.js -- the kinds of backup a future provider may implement. No implementation here.
import { deepFreeze } from '../shared/freezeDeep.js';

export const BACKUP_TYPES = deepFreeze({
  JSON: 'json',
  ZIP: 'zip',
  CLOUD: 'cloud',
  INCREMENTAL: 'incremental'
});
