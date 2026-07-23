// validators/validationResult.js
// The structured result every validation stage returns -- arrays of
// DataExchangeError objects grouped by severity, never a thrown string.
// Deliberately distinct from js/ui/forms' string-or-null validator shape:
// that's a single-field, live-UI-input convention; this is a batch-of-
// hundreds-of-records, aggregate-and-report convention. Different problem,
// different (and non-colliding) shape.

export function createValidationResult ({ errors = [], warnings = [], information = [] } = {}) {
  return {
    errors, warnings, information,
    isValid: () => errors.length === 0,
    merge: (other) => createValidationResult({
      errors: errors.concat(other.errors),
      warnings: warnings.concat(other.warnings),
      information: information.concat(other.information)
    }),
    toSummary: () => `${errors.length} error(s), ${warnings.length} warning(s), ${information.length} info`
  };
}
