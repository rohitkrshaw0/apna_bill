// Wires the result of a validator (from js/ui/forms/validation) to an
// actual field on the page — closing the gap between "here's a reusable
// function that computes whether a value is valid" and "the field
// actually shows that error and clears it once corrected."
//
// Before this file, every page had to hand-wire, per validated field: run
// the validator, call setFieldError, optionally focus the field, and set
// up an `input` listener to clear the error once the value becomes valid
// again. That's the exact per-page duplication the rest of this
// framework exists to remove — it had just moved from markup into
// imperative JS instead of disappearing. What counts as valid and what
// message to show is still entirely up to the page (via which validators
// it passes in); this file only owns wiring that result to the field.
//
// Two functions, used together:
//   watchFieldValidation() — call once, right after a field is mounted,
//     to auto-clear its error the moment the value becomes valid again
//     while the user is correcting it.
//   validateField() — call from a submit handler (or wherever a
//     point-in-time check is needed) to run the validators, show the
//     first failing message, and report whether the field passed.
import { setFieldError, clearFieldError } from './fieldError.js';
import { idSelector } from './idSelector.js';

function runValidators (validators, value) {
  for (const validate of validators) {
    const message = validate(value);
    if (message) return message;
  }
  return null;
}

function readCurrentValue (input) {
  return input.type === 'checkbox' ? input.checked : input.value;
}

// Runs `validators` in order against the field's current value (or an
// explicit `value` override, e.g. a trimmed/coerced value already
// computed for a submit payload) and shows the first failing message in
// the field's error slot, clearing it if every validator passes. Returns
// that message, or null when valid. Pass `focus: true` to move keyboard
// focus to the field when it fails — the usual behavior for a submit-time
// check.
export function validateField ({ root = document, id, validators = [], value, focus = false }) {
  const input = root.querySelector(idSelector(id));
  const currentValue = value !== undefined ? value : (input ? readCurrentValue(input) : undefined);
  const message = runValidators(validators, currentValue);
  if (message) {
    setFieldError(root, id, message);
    if (focus && input) input.focus();
  } else {
    clearFieldError(root, id);
  }
  return message;
}

// Wires the field so its error clears automatically the moment the value
// becomes valid again while the user is typing/toggling it. Call this
// once per validated field, right after the field is mounted (or as part
// of the same renderFieldsInto call — see items.html for the pattern).
export function watchFieldValidation ({ root = document, id, validators = [] }) {
  const input = root.querySelector(idSelector(id));
  if (!input) return;
  const eventName = input.type === 'checkbox' ? 'change' : 'input';
  input.addEventListener(eventName, () => {
    const message = runValidators(validators, readCurrentValue(input));
    if (!message) clearFieldError(root, id);
  });
}
