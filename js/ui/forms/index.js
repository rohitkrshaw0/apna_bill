// Public entry point for the Form Framework. Pages should import
// everything they need from this one path — never reach into
// js/ui/forms/core/ or js/ui/forms/fields/*.js / validation/*.js
// directly. That's what lets the internal file layout keep changing (new
// fields, refactored core pieces) without ever having to touch a page's
// imports.

export { renderFieldsInto } from './core/renderFieldsInto.js';
export { validateField, watchFieldValidation } from './core/fieldValidation.js';

export { textField } from './fields/textField.js';
export { numberField } from './fields/numberField.js';
export { currencyField } from './fields/currencyField.js';
export { selectField } from './fields/selectField.js';
export { textareaField } from './fields/textareaField.js';
export { checkboxField } from './fields/checkboxField.js';
export { quickPickNumberField } from './fields/quickPickNumberField.js';
export { gstRateField } from './fields/gstRateField.js';

export { required, percentage, currency } from './validation/index.js';

export { lineItemRow } from './components/lineItemRow.js';

// Imperative helpers for showing/clearing a field's error message after
// validation runs (e.g. in a form's submit handler) — see
// core/fieldError.js for the full explanation.
export { setFieldError, clearFieldError } from './core/fieldError.js';
