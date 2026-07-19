// The single entry point every field factory in js/ui/forms/fields/ calls
// to produce its final HTML. It ties together the three focused core
// pieces this framework is built from:
//
//   fieldLabel.js   — how the label text + required marker looks
//   fieldError.js   — how the error slot looks and is later updated
//   fieldWrapper.js — how all the pieces are laid out together
//
// so that every field rendered anywhere in the app is structured
// identically, and each of those three concerns can be changed in exactly
// one file without touching the others.
//
// A field factory (textField, numberField, currencyField, ...) is
// responsible ONLY for building `control` — the actual <input>/<select>/
// etc. markup for that field type, plus its own `mount()` wiring. Field
// factories must never build label, required-marker, help-text or error
// markup themselves — that would reintroduce exactly the kind of
// per-page duplication this framework exists to remove.
import { renderFieldLabel } from './fieldLabel.js';
import { renderFieldError } from './fieldError.js';
import { renderFieldWrapper } from './fieldWrapper.js';

// `layout` defaults to 'label-first' (every field except checkboxField)
// and is passed straight through to renderFieldWrapper — see that file
// for what each layout produces. Field factories only need to think about
// this if their control genuinely reads before its label (checkboxField
// is currently the only one).
export function renderField ({ id, label, required = false, className = '', helpText = '', error = '', control, layout = 'label-first' } = {}) {
  const labelHtml = renderFieldLabel({ label, required });
  const errorHtml = renderFieldError({ id, error });
  return renderFieldWrapper({ className, labelHtml, controlHtml: control, helpText, errorHtml, layout });
}
