// validators/stages/fileValidator.js -- is the raw source well-formed (before any parsing of content)?
import { createStageValidator } from './createStageValidator.js';

export function createFileValidator ({ rules = [] } = {}) {
  return createStageValidator('file', { rules });
}
