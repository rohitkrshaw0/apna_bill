// Inserts a group of already-built fields into a container element and
// mounts every one of them, in one call.
//
// Before this helper, a page built up an array of fields, set
// `container.innerHTML = fields.map(f => f.html).join('')`, and then had
// to remember to separately call `.mount()` on each one. For most field
// types that's harmless to forget — their `mount()` only wires an
// optional `onChange` — but for quickPickNumberField/gstRateField,
// `mount()` also wires the chip-click and chip-sync behavior, which is
// NOT optional: skip it and the chips silently stop responding to clicks,
// with no error anywhere. Two field types you can safely skip `.mount()`
// on and one you can't is exactly the kind of inconsistency that gets a
// form shipped broken.
//
// Using this helper instead of the manual innerHTML + forEach pattern
// removes the chance of that mistake by construction: there is no
// insertion path through this function that doesn't also mount. Fields
// are still mounted scoped to `container` (not the whole `document`),
// which is the safer default — it's the only place their ids could
// possibly be, and it keeps lookups from ever reaching outside the group
// being rendered.
export function renderFieldsInto (container, fields) {
  container.innerHTML = fields.map(field => field.html).join('');
  fields.forEach(field => field.mount(container));
}
