// One toaster per page: const toast = createToaster('toasts'); toast('Saved', 'ok');
export function createToaster (containerId = 'toasts') {
  const container = document.getElementById(containerId);
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
