import { escapeHtml } from './escape.js';

// Milestone 13A closes three documented gaps in this factory:
// - Title-only variant: omitting `message` previously rendered
//   `<p>undefined</p>`; passing '' rendered a spurious empty `<p>`. This is
//   exactly why stock.html's #history-empty was left hand-written rather
//   than adopting this factory (docs/milestone-8.5-migration.md's own gap
//   report). `message` is now genuinely optional -- omit it entirely for a
//   title-only empty state.
// - escapeHtml on interpolated text -- previously raw, unlike every
//   sibling factory (partyRow.js, batchRow.js, the form fields).
// - Optional action slot -- css/shared.css's `.empty p { margin-bottom:
//   var(--space-20) }` already reserves space for a CTA this factory
//   couldn't previously produce. `actionHtml` is caller-owned markup (a
//   button, a link), same convention as batchRow.js's `subtitleHtml`.
export function createEmptyState ({ id, title, message, actionHtml = '' } = {}) {
  const idAttr = id ? ` id="${id}"` : '';
  const messageHtml = message ? `<p>${escapeHtml(message)}</p>` : '';
  return `<div${idAttr} class="empty hidden"><h3>${escapeHtml(title)}</h3>${messageHtml}${actionHtml}</div>`;
}
