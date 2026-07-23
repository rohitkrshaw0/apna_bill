// validators/stages/schemaValidator.js -- does parsed data match the expected DTO shape?
import { createStageValidator } from './createStageValidator.js';

export function createSchemaValidator ({ rules = [] } = {}) {
  return createStageValidator('schema', { rules });
}
