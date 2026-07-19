export function createEmptyState ({ id, title, message } = {}) {
  const idAttr = id ? ` id="${id}"` : '';
  return `<div${idAttr} class="empty hidden"><h3>${title}</h3><p>${message}</p></div>`;
}
