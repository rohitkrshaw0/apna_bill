// validators/stages/relationshipValidator.js -- are cross-entity relationships internally consistent?
import { createStageValidator } from './createStageValidator.js';

export function createRelationshipValidator ({ rules = [] } = {}) {
  return createStageValidator('relationship', { rules });
}
