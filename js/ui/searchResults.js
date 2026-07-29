// Item-search results dropdown — closes the gap
// docs/reports/milestone-13A-ux-audit.md named: renderResults() triplicated
// (near-quadruplicated with manufacturing.html's own renderProducedResults())
// across sale.html/purchase.html/manufacturing.html. Emits the SAME
// .results/.result-row/.result-name/.result-meta/.result-price/.result-add/
// .result-empty/.result-add-new classes already styled in css/shared.css --
// no new CSS.
//
// `metaHtml`/`priceHtml` are per-item formatter callbacks (caller-built HTML
// strings, caller responsible for escaping any interpolated values -- same
// convention as js/ui/batchRow.js's `subtitleHtml`) so each page keeps its
// own price field and meta line: sale.html reads default_retail_price,
// purchase.html reads default_purchase_price, manufacturing.html's two call
// sites have no price column at all (priceHtml omitted renders the same
// empty `.result-price` div the grid's 3-column layout already expects).
import { escapeHtml } from './escape.js';

export function renderSearchResults (container, items, query, { priceHtml, metaHtml, addLabel = 'Add', onSelect, onCreateNew } = {}) {
  if (!items.length) {
    container.innerHTML = `
      <div class="result-empty">No items match "${escapeHtml(query)}".</div>
      ${onCreateNew ? `<button type="button" class="result-add-new">+ Create "${escapeHtml(query)}" now</button>` : ''}`;
    container.classList.add('open');
    if (onCreateNew) {
      container.querySelector('.result-add-new').addEventListener('click', () => onCreateNew(query));
    }
    return;
  }
  container.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'result-row';
    row.innerHTML = `
      <div>
        <div class="result-name">${escapeHtml(item.name)}</div>
        <div class="result-meta">${metaHtml ? metaHtml(item) : ''}</div>
      </div>
      <div class="result-price mono">${priceHtml ? priceHtml(item) : ''}</div>
      <div class="result-add">${escapeHtml(addLabel)}</div>`;
    row.addEventListener('click', () => onSelect(item));
    container.appendChild(row);
  }
  container.classList.add('open');
}
