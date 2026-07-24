// validators/stages/createStageValidator.js
// Shared shape behind all 7 validation stages (File/Schema/Business/
// Relationship/Reference/Duplicate/Conflict) -- each stage differs only in
// name and which rules are injected, so the run-rules-and-merge logic lives
// here once instead of being copy-pasted per stage.
//
// A rule is `(dtoList, context) => { errors?, warnings?, information? }`
// (partial arrays) -- it sees the whole batch, since some checks (e.g.
// duplicate detection) are inherently whole-list, not per-record.

import { createValidationResult } from '../validationResult.js';

export function createStageValidator (name, { rules = [] } = {}) {
  return {
    name,
    validate: (dtoList, context = {}) => {
      let result = createValidationResult();
      for (const rule of rules) {
        const partial = rule(dtoList, context) || {};
        result = result.merge(createValidationResult(partial));
      }
      return result;
    }
  };
}
