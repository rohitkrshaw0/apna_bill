// Builds the common HTML attribute string every field's native control
// shares: `id` plus the boolean attributes (`required`/`disabled`/
// `readonly`) that are simple presence-or-absent flags. Centralizing this
// is what lets a new universal attribute (`autocomplete`, `maxlength`,
// `aria-describedby`, ...) be added once here instead of copy-pasted into
// every fields/*.js file.
//
// Returns a string like `id="f-name" required disabled` — ready to drop
// into a template literal's attribute list. Field-specific attributes
// (`type`, `value`, `step`, `min`, `list`, ...) are NOT this function's
// job; each field factory still builds those itself, since they
// genuinely differ per control type.
//
// A field type that doesn't support one of these — selectField has no
// `readonly` (native <select> doesn't have one), checkboxField has
// neither `readonly` — simply doesn't pass that option through, and it's
// left out rather than rendered as a no-op attribute.
export function buildControlAttrs ({ id, required = false, disabled = false, readonly = false } = {}) {
  return [
    `id="${id}"`,
    required ? 'required' : '',
    disabled ? 'disabled' : '',
    readonly ? 'readonly' : ''
  ].filter(Boolean).join(' ');
}
