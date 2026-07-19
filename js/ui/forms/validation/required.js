// A validator that fails when a value is empty.
//
// Every validator in js/ui/forms/validation follows the same shape: a
// factory function that takes an optional config object and returns a
// `check` function. `check` takes the field's current value and returns
// either `null` (valid) or an error message string (invalid). This same
// shape is reused for every validator so they can be composed and reused
// identically everywhere, and so a page can override the message without
// needing a different validator.
//
// "Empty" means: null, undefined, or a string containing only whitespace
// once trimmed. This matches the manual checks already used across the
// app today, e.g. `if (!name) { ... }` after `name.trim()`.

export function required ({ message = 'This field is required' } = {}) {
  return function check (value) {
    const isEmpty = value === null || value === undefined || String(value).trim() === '';
    return isEmpty ? message : null;
  };
}
