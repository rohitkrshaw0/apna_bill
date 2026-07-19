// Builds a safe CSS id-selector (e.g. `#f-name`) for use with
// querySelector, so every field's mount() looks up its control the same
// safe way instead of interpolating `id` into a selector string by hand.
//
// Every id in the app today is a simple kebab-case string, so the naive
// `#${id}` has never broken in practice — but nothing stops a future
// field from being given an id containing a character CSS treats
// specially (a dot, colon, leading digit, ...), which would either throw
// a SyntaxError from querySelector or silently fail to match. CSS.escape
// is the standard fix: it escapes exactly the characters that would
// otherwise be misread as selector syntax.
export function idSelector (id) {
  return `#${CSS.escape(id)}`;
}
