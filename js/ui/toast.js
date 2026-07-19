// One toaster per page: const toast = createToaster('toasts'); toast('Saved', 'ok');
export function createToaster (containerId = 'toasts') {
  const container = document.getElementById(containerId);
  return function toast (msg, type = 'ok', ms = 3200) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), ms);
  };
}
