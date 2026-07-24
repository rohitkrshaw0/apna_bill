// validators/stages/businessValidator.js -- does data satisfy business rules (e.g. required fields, ranges)?
import { createStageValidator } from './createStageValidator.js';

export function createBusinessValidator ({ rules = [] } = {}) {
  return createStageValidator('business', { rules });
}
