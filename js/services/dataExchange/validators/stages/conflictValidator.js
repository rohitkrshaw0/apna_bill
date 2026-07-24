// validators/stages/conflictValidator.js -- surfaces unresolved conflicts (see ../../conflicts/) as validation information.
import { createStageValidator } from './createStageValidator.js';

export function createConflictValidator ({ rules = [] } = {}) {
  return createStageValidator('conflict', { rules });
}
