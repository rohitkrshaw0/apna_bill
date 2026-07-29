// Loading-state primitives per Design System §22 (Milestone 13A amendment).
// Closes the largest gap the 13A UX audit found: zero loading/skeleton UI
// existed anywhere in the app (docs/reports/milestone-13A-ux-audit.md
// §1.7). Visual half lives in css/shared.css's .skeleton/.skeleton-row/
// .skeleton-card/.skeleton-text rules; this module is the DOM half.

export function createSkeletonRow () {
  const el = document.createElement('div');
  el.className = 'skeleton skeleton-row';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export function createSkeletonCard () {
  const el = document.createElement('div');
  el.className = 'skeleton skeleton-card';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export function createSkeletonText ({ width } = {}) {
  const el = document.createElement('div');
  el.className = 'skeleton skeleton-text';
  if (width) el.style.width = width;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

// Renders `count` skeleton placeholders into `container`, replacing its
// current children, and marks the container aria-busy -- for a list region
// about to fetch its data. Pair with setBusy(container, false) (or simply
// let the real setRows()/innerHTML replacement overwrite it) once data
// arrives.
export function renderSkeletonList (container, { count = 3, kind = 'row' } = {}) {
  const factory = kind === 'card' ? createSkeletonCard : createSkeletonRow;
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) frag.appendChild(factory());
  container.appendChild(frag);
  container.setAttribute('aria-busy', 'true');
}

// Marks/unmarks an element as loading -- the `data-loading` authoring
// convention plus `aria-busy` Design System §22.3 names as the "universal
// loading state contract" -- without touching its children. For regions
// where the caller renders its own skeleton markup, or where the signal
// alone (no skeleton) is what's needed, e.g. a dialog that must not appear
// to have finished loading before its fetch resolves (the stock.html
// openHistory() gap the audit found at stock.html:380-388).
export function setBusy (el, busy) {
  el.toggleAttribute('data-loading', busy);
  if (busy) el.setAttribute('aria-busy', 'true');
  else el.removeAttribute('aria-busy');
}
