// validators/validationPipeline.js
// Runs an ordered list of stages (each an {name, validate()} — see stages/)
// against a DTO list, merging results. haltOnError stops at the first
// stage whose result isn't valid, otherwise every stage always runs.

import { createValidationResult } from './validationResult.js';

export function createValidationPipeline (stages = [], { haltOnError = false } = {}) {
  return {
    run: (dtoList, context = {}) => {
      let result = createValidationResult();
      for (const stage of stages) {
        const stageResult = stage.validate(dtoList, context);
        result = result.merge(stageResult);
        if (haltOnError && !stageResult.isValid()) break;
      }
      return result;
    }
  };
}
