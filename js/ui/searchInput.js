export function createSearchInput ({ id, placeholder = 'Search…' } = {}) {
  return `<input id="${id}" class="search" type="search" placeholder="${placeholder}">`;
}
