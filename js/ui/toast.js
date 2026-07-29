// One toaster per page: const toast = createToaster('toasts'); toast('Saved', 'ok');
export function createToaster (containerId = 'toasts') {
  const container = document.getElementById(containerId);
  // Milestone 13A: the container itself had no aria-live region, so a
  // screen reader had no signal that new toasts could appear at all except
  // each toast's own role="alert" below. aria-live="polite" here is a
  // second, gentler channel; role="alert" on the 'warn' toasts still forces
  // an assertive interrupt for failures regardless of this setting.
  if (container && !container.hasAttribute('aria-live')) {
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
  }
  return function toast (msg, type = 'ok', ms = 3200) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    // role="alert" makes screen readers announce this the moment it's
    // inserted (implies an assertive live region) — set before appending,
    // since adding it to an already-inserted element doesn't reliably
    // trigger the announcement in every AT.
    el.setAttribute('role', 'alert');
    container.appendChild(el);
    setTimeout(() => el.remove(), ms);
  };
}
