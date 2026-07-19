export function createButton ({ label, variant = 'primary', id, type = 'button', extraClass = '' } = {}) {
  const idAttr = id ? ` id="${id}"` : '';
  const cls = `btn ${variant}${extraClass ? ' ' + extraClass : ''}`;
  return `<button type="${type}" class="${cls}"${idAttr}>${label}</button>`;
}
