// history/historyEntry.js
// One factory for every kind of history entry (import/export/backup/
// restore) -- `type` distinguishes them, so there's no need for four
// near-identical wrapper files. Builds on dto/historyDTO.js's shape rather
// than duplicating its fields, and adds the one query every consumer of a
// history entry needs: isSuccess().

import { createHistoryDTO } from '../dto/historyDTO.js';
import { HISTORY_STATUS } from './historyStatus.js';

export function createHistoryEntry (fields = {}) {
  const dto = createHistoryDTO(fields);
  return { ...dto, isSuccess: () => dto.status === HISTORY_STATUS.SUCCESS };
}
