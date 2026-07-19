import { icon } from './icons.js';

export function createSearchInput ({ id, placeholder = 'Search…' } = {}) {
  return `
    <div class="search-wrap">
      ${icon('search', { size: 20, className: 'icon-search' })}
      <input id="${id}" class="search" type="search" placeholder="${placeholder}">
    </div>
  `;
}
