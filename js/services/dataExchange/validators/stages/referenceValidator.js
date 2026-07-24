// validators/stages/referenceValidator.js -- do referenced IDs (e.g. item_id on a purchase line) actually exist?
import { createStageValidator } from './createStageValidator.js';

export function createReferenceValidator ({ rules = [] } = {}) {
  return createStageValidator('reference', { rules });
}
