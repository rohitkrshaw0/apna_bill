// Builds the common HTML attribute string every field's native control
// shares: `id` plus the boolean attributes (`required`/`disabled`/
// `readonly`) that are simple presence-or-absent flags. Centralizing this
// is what lets a new universal attribute (`autocomplete`, `maxlength`,
// `aria-describedby`, ...) be added once here instead of copy-pasted into
// every fields/*.js file.
//
// Returns a string like `id="f-name" required disabled aria-describedby="…"`
// — ready to drop into a template literal's attribute list. Field-specific
// attributes (`type`, `value`, `step`, `min`, `list`, ...) are NOT this
// function's job; each field factory still builds those itself, since they
// genuinely differ per control type.
//
// A field type that doesn't support one of these — selectField has no
// `readonly` (native <select> doesn't have one), checkboxField has
// neither `readonly` — simply doesn't pass that option through, and it's
// left out rather than rendered as a no-op attribute.
//
// `aria-describedby` (Milestone 13A) links the control to its help text and
// error slot — core/fieldError.js's error span always renders with
// `id="{id}-error"` regardless of whether it currently holds a message, so
// that id is always included; `{id}-help` is included only when `helpText`
// is given, matching core/fieldWrapper.js only rendering that span when
// there's text to show. Previously the error/help text was visible but not
// programmatically associated with the control — a screen reader never
// read it as part of the field.
export function buildControlAttrs ({ id, required = false, disabled = false, readonly = false, helpText = '' } = {}) {
  const describedBy = [helpText ? `${id}-help` : '', `${id}-error`].filter(Boolean).join(' ');
  return [
    `id="${id}"`,
    required ? 'required' : '',
    disabled ? 'disabled' : '',
    readonly ? 'readonly' : '',
    `aria-describedby="${describedBy}"`
  ].filter(Boolean).join(' ');
}
