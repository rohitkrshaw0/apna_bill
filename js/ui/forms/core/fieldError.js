// Renders a form field's error slot, and provides the imperative helpers
// used to show/hide an error message after the field is already on the
// page (e.g. from a submit handler's validation step).
//
// This is the ONLY place in the Form Framework that builds error-message
// HTML or writes an error message into the DOM. Field factories and pages
// never build their own error `<span>`/`<small>` — they render a field
// with an initial `error` string (or none), and later call setFieldError /
// clearFieldError to update it. If error styling or behaviour ever needs
// to change, this is the one file to edit.
//
// The slot is always rendered, even when there is no error yet, so it
// reserves a stable place in the DOM for setFieldError to find later
// without re-rendering the whole field. css/shared.css hides it visually
// (`.field-error:empty { display: none; }`) whenever there's no message.

export function renderFieldError ({ id, error = '' } = {}) {
  return `<span class="field-error" data-error-for="${id}">${error}</span>`;
}

// Finds the error slot for `id` inside `root` and shows `message` in it.
// `root` should be the form/dialog element the field lives in when one is
// available (matching how the rest of the app scopes its `$('#…')`
// lookups) — it defaults to `document` for callers that don't have a
// narrower root at hand.
//
// `id` is run through CSS.escape before it's placed inside the attribute
// selector, so a value containing a `"` or other selector-special
// character can't break the lookup — see core/idSelector.js for the same
// concern on the plain `#id` selectors every field's mount() uses.
export function setFieldError (root = document, id, message) {
  const slot = root.querySelector(`[data-error-for="${CSS.escape(id)}"]`);
  if (slot) slot.textContent = message;
}

// Clears whatever error message is currently shown for `id`.
export function clearFieldError (root = document, id) {
  setFieldError(root, id, '');
}
