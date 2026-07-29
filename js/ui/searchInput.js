import { icon } from './icons.js';

export function createSearchInput ({ id, placeholder = 'Search…' } = {}) {
  // aria-label (Milestone 13A): a placeholder alone is not a reliable
  // accessible name -- it disappears the moment the user types, and some
  // assistive tech never reads it as the name in the first place.
  return `
    <div class="search-wrap">
      ${icon('search', { size: 20, className: 'icon-search' })}
      <input id="${id}" class="search" type="search" placeholder="${placeholder}" aria-label="${placeholder}">
    </div>
  `;
}
