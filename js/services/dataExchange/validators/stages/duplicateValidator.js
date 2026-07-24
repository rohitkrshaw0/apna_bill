// validators/stages/duplicateValidator.js -- does incoming data duplicate itself or existing records?
import { createStageValidator } from './createStageValidator.js';

export function createDuplicateValidator ({ rules = [] } = {}) {
  return createStageValidator('duplicate', { rules });
}
