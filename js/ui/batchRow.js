import { escapeHtml } from './escape.js';

// A row in the batch-picker dialog (sale: choose an existing batch to sell from;
// purchase: copy a previous batch's details as a template for a new lot).
export function createBatchRow ({ label, subtitleHtml = '', stockText = '', onClick }) {
  const btn = document.createElement('button');
  btn.className = 'batch-row';
  btn.innerHTML = `
    <div>
      <div style="font-weight:var(--weight-semibold);color:var(--color-text);">${escapeHtml(label)}</div>
      <div style="font-size:var(--text-12);color:var(--color-text-muted);">${subtitleHtml}</div>
    </div>
    <div class="stock mono">${escapeHtml(stockText)}</div>`;
  btn.addEventListener('click', onClick);
  return btn;
}
