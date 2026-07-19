# Form Framework

`js/ui/forms/` is ApnaBill's shared system for building form fields — one
place that owns how a label, a required marker, help text, and an error
message look and behave, so a visual or behavioral change to any of those
only ever requires editing one file instead of every page that has a form.

It's plain ES modules, no build step, no framework dependency — matching
the rest of this app. Every field factory returns an HTML string plus a
`mount()` function; pages insert the string and call `mount()` the same
way they'd wire up any other piece of markup.

`items.html` is the reference implementation. Read it alongside this doc
to see the pattern applied to a real form.

## Quick start

```js
import { textField, currencyField, renderFieldsInto } from './js/ui/forms/index.js';

const nameField = textField({ id: 'f-name', label: 'Item name', required: true, className: 'full' });
const priceField = currencyField({ id: 'f-price', label: 'Price' });

renderFieldsInto(document.querySelector('#my-grid'), [nameField, priceField]);
```

That's the whole pattern: build field objects, hand them to
`renderFieldsInto` as a group, done. **Always import from
`js/ui/forms/index.js`** — never reach into `core/`, `fields/*.js`, or
`validation/*.js` directly. The internal layout is free to change as long
as the barrel's exports don't.

## Folder structure

```
js/ui/forms/
  index.js                  — the only import path pages should use
  forms.test.html            — browser-runnable test suite (see below)
  core/                       — shared rendering/wiring building blocks
    fieldLabel.js             — label text + required marker (only place it's built)
    fieldError.js             — error slot markup + setFieldError/clearFieldError
    fieldWrapper.js            — assembles label/control/help/error into one <label>
    renderField.js              — the entry point every field factory calls
    buildControlAttrs.js         — shared id/required/disabled/readonly attribute string
    idSelector.js                 — safe #id CSS-selector construction (CSS.escape)
    fieldValidation.js             — validateField() / watchFieldValidation()
    renderFieldsInto.js             — insert + mount a group of fields in one call
  fields/                     — one file per field type (see reference below)
  validation/                 — pure validator functions (required, percentage, currency)
```

## Field API reference

Every field factory takes one options object and returns `{ html, mount(root) }`.
Options in **bold** are shared by (almost) every field type:

| Option | Type | Meaning |
|---|---|---|
| **id** | string | Used as the control's `id` and as the key for error-slot lookups. Must be unique on the page (or within the container you pass to `renderFieldsInto`). |
| **label** | string | Rendered as the field's label text. |
| **value** | varies | The control's initial value — a string for text-like fields, a number for numeric fields, a boolean for `checkboxField`. Same option name across every field type on purpose: switching a field's type is a type change, not a rename. |
| **required** | boolean | Renders the native HTML `required` attribute *and* the red required marker (via `fieldLabel.js`). Rendering-only — it does **not** wire any validation; see [Validation](#validation) below. |
| **disabled** | boolean | Renders the native `disabled` attribute. |
| **readonly** | boolean | Renders the native `readonly` attribute — **not supported by every field**: `selectField` and `checkboxField` omit it, because neither `<select>` nor `<input type="checkbox">` has a real readonly behavior a browser will honor. |
| **helpText** | string | Rendered as a `<small class="field-help">` under the control. |
| **error** | string | An error message to show immediately on render (rare — normally errors are set later via `validateField`/`setFieldError`). |
| **className** | string | Extra class(es) on the field's outer `<label>` — e.g. `'full'` to span a `.form-grid`'s full width. |
| **onChange** | function | Called with the control's current value whenever it changes. Optional — most pages read `.value` once at submit time and never pass this. |

### Field types

| Factory | Control | Field-specific options | Notes |
|---|---|---|---|
| `textField` | `<input type="text">` | `placeholder`, `list`, `leading`, `trailing` | `leading`/`trailing` are raw HTML strings rendered just inside the input on either side of it — for a generate/scan/search button, a password-visibility toggle, a currency prefix, etc. When neither is given, renders a plain `<input>` with no extra wrapper. The caller wires up whatever markup it passes (see items.html's barcode-generate button for the pattern). |
| `numberField` | `<input type="number">` | `placeholder`, `min`, `max`, `step` (default `'any'`) | For plain numbers that aren't money or a percentage. |
| `currencyField` | `<input type="number">` | `placeholder`, `min` | Fixed `inputmode="decimal"` and `step="0.01"` — not configurable, since that's the one true convention for money in this app. |
| `selectField` | `<select>` | `options` (array of strings, or `{ value, label }` objects) | No `readonly`. |
| `textareaField` | `<textarea>` | `placeholder`, `rows` (default 3) | |
| `checkboxField` | `<input type="checkbox">` | — | No `readonly`. Laid out **control-first** (checkbox, then label text, on one row) via `renderField`'s `layout: 'control-first'` option — see [Layout](#layout) below. `value` is the boolean checked-state. |
| `quickPickNumberField` | `<input type="number">` + a row of pick buttons | `picks` (array of numbers), `suffix` (default `'%'`) | Generic "type a number, or click a common value" field. Not GST-specific — reuse it directly for discount %, margin %, commission %, service charge %, or any other percentage-style field. Clicking a chip fills the input and marks it active; typing a value that matches a chip marks that chip active too (and typing a non-matching value clears whichever chip was active). |
| `gstRateField` | (same as `quickPickNumberField`) | — | A thin, fixed configuration of `quickPickNumberField` for `[0, 5, 12, 18, 28]` with the label `'GST rate %'` defaulted. Only add another wrapper like this one for a percentage field that's genuinely reused across several call sites with the same fixed picks — otherwise call `quickPickNumberField` directly. |

## Rendering a group of fields: always use `renderFieldsInto`

```js
renderFieldsInto(container, [fieldA, fieldB, fieldC]);
```

This does two things: sets `container.innerHTML` to the fields' combined
HTML, and calls every field's `mount(container)`. **Always use this
instead of manually doing `container.innerHTML = ...` and looping over
`.mount()` yourself.** For most field types, forgetting to call `mount()`
is harmless — it only wires an optional `onChange`. For
`quickPickNumberField`/`gstRateField`, `mount()` also wires the
chip-click/chip-sync behavior, which is **not optional** — skip it and
the chips silently stop responding to clicks, with no error anywhere.
`renderFieldsInto` removes that foot-gun by construction: there's no path
through it that inserts HTML without also mounting.

If you genuinely need to insert and mount a single field by hand instead
of through this helper, call `field.mount(container)` yourself — but
prefer `renderFieldsInto` even for a group of one, so the pattern stays
uniform across the codebase.

## Validation

The validators in `js/ui/forms/index.js` (`required`, `percentage`,
`currency`) are **pure functions** — they compute whether a value is
valid, nothing more:

```js
const check = required({ message: 'Item name is required' });
check('')        // 'Item name is required'
check('Cotton')  // null
```

Every validator has this same shape: a factory that takes an optional
config object and returns a `(value) => message | null` function. This is
what lets them compose the same way regardless of which field they're
checking.

`required: true` on a field is a **separate, unrelated** concern — it
only renders the native HTML `required` attribute and the red marker. It
does not run any validator and does not need to match up with one
one-for-one. Don't assume setting one wires the other.

### Wiring a validator to a field

Two functions close the gap between "a validator" and "a field that
actually shows and clears its own error" — this is the part every page
used to hand-roll itself before these existed:

```js
import { required, validateField, watchFieldValidation } from './js/ui/forms/index.js';

const nameValidators = [required({ message: 'Item name is required' })];

// Call once, right after the field is rendered/mounted — clears the
// error automatically the moment the user corrects the value.
watchFieldValidation({ root: document, id: 'f-name', validators: nameValidators });

// Call from your submit handler — runs the validators, shows the first
// failing message in the field's error slot, and (with focus: true)
// moves keyboard focus there. Returns the message, or null if valid.
const error = validateField({
  root: document, id: 'f-name', validators: nameValidators,
  value: payload.name, focus: true
});
if (error) { toast(error, 'warn'); return; }
```

`value` in `validateField` is optional — omit it and the current value is
read straight from the DOM control; pass it explicitly when you've
already computed a trimmed/coerced value for a submit payload (as in the
example above) so the same value is both validated and saved.

What counts as valid and what message to show is still entirely up to
the page, via which validators it passes in — `validateField`/
`watchFieldValidation` only own getting that result onto the field. A
page-level notification (a toast, say) is a separate, page-owned concern
and isn't part of these functions.

## Layout

`renderField`'s `layout` option controls whether a field's control renders
before or after its label:

- `'label-first'` (default) — every field except `checkboxField`.
- `'control-first'` — the control reads before the label text, on one row.
  Currently only `checkboxField` uses this, to match the app's `.chk-row`
  convention (checkbox, then its label text).

There is exactly one place (`fieldWrapper.js`) that knows how to assemble
a field's pieces, for either layout. If you're tempted to hand-build a
field's `<label>...</label>` markup yourself instead of going through
`renderField`, that's a sign you need a new `layout` value here, not a
one-off implementation in your field file.

## Escaping and safe selectors

- Any field-supplied string that ends up inside an HTML attribute or text
  content (`value`, `placeholder`, `label` for `selectField` options) goes
  through `js/ui/escape.js`'s `escapeHtml` before interpolation. This is
  the same utility already used elsewhere in the app (`partyRow.js`, etc.)
  — reuse it, don't add another one.
- Any `id` that ends up inside a `querySelector` call goes through
  `core/idSelector.js` (`#${CSS.escape(id)}`) rather than being
  interpolated raw. Every id in the app today is a simple kebab-case
  string that would work either way — this exists so a future field given
  an id containing a `.`, `:`, space, or similar doesn't throw a
  `SyntaxError` or silently fail to match.

## Adding a new field type

1. Create `fields/yourField.js`. Build your control's HTML, using
   `buildControlAttrs({ id, required, disabled, readonly })` for the
   common attributes and adding whatever's specific to your control type
   (`type`, `value`, `step`, ...) yourself.
2. Call `renderField({ id, label, required, className, helpText, error, control })`
   to get the final HTML — don't build the label, required marker, help
   text, or error markup yourself. If your control genuinely needs to
   read before its label (like `checkboxField`), pass `layout: 'control-first'`.
3. Return `{ html, mount }`. In `mount(root = document)`, look up your
   control with `root.querySelector(idSelector(id))` and wire whatever
   your control needs — chip clicks, `onChange`, etc. If your field has
   any interactive behavior beyond a bare `onChange` (like the quick-pick
   chips), that wiring must be unconditional, not gated behind
   `if (onChange)` — `mount()` must never be a silent no-op for behavior
   the field actually needs.
4. Export it from `index.js`.
5. Add it to `forms.test.html` — at minimum: renders with the right id,
   required marker present/absent correctly, and any interactive behavior
   works after going through `renderFieldsInto` (not a manual `.mount()`
   call — that's the scenario C3 exists to protect).

## Testing

`forms.test.html` is a static page — no test runner, no build step. Open
it directly in a browser to see PASS/FAIL for every check, or run it
headlessly:

```bash
python -m http.server 8743
chrome --headless=new --disable-gpu --virtual-time-budget=3000 \
  --dump-dom http://localhost:8743/js/ui/forms/forms.test.html
```

The `<title>` reflects the outcome (`Form Framework tests: 51/51 passed`)
so a headless dump can be checked at a glance. Run this after any change
to `js/ui/forms/` — it's the framework's only regression safety net.

## Known limitations (as of this writing)

- **No first-class support for repeated field groups.** Every id must be
  unique within whatever root you mount into. A form with N repeating
  rows (e.g. a cart line item, a batch row) needs to generate unique ids
  per row itself (`f-gst-${rowIndex}`) — the framework doesn't have a
  built-in pattern for that yet.
- **No `onBlur`/`onFocus` hook** — only `onChange`. "Validate on blur" is
  possible today by wiring it yourself the way `watchFieldValidation`
  wires `input`/`change`, but there's no shared helper for it yet.
- Legacy CSS (`.gst-quick`, `.code-row`, `.chk-row`) still exists
  alongside this framework's equivalents (`.quick-pick-chips`,
  `.field-control-row`) because `quickAddItemDialog.js` and every
  unmigrated page still use the old classes. This should be deleted once
  every page has migrated — don't add new code against the legacy classes.
