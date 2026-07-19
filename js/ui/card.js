import { createBadge } from './badge.js';
import { createKebabMenu } from './kebabMenu.js';

// A "list card": name + optional current badge, a meta line, an Open button and a kebab menu.
// Used for the company list on index.html; the same shape works for any "row of things you can
// open, rename, delete" list elsewhere in the app.
export function createListCard ({ name, current = false, metaHtml = '', openLabel = 'Open', onOpen, kebabActions = [] } = {}) {
  const card = document.createElement('div');
  card.className = 'card' + (current ? ' current' : '');
  card.innerHTML = `
    <div>
      <div class="co-name">
        <span></span>
        ${current ? createBadge('Current', 'current') : ''}
      </div>
      <div class="co-meta">${metaHtml}</div>
    </div>
    <div class="card-actions"></div>
  `;
  card.querySelector('.co-name > span').textContent = name;

  const actions = card.querySelector('.card-actions');
  const openBtn = document.createElement('button');
  openBtn.className = 'btn-open';
  openBtn.textContent = openLabel;
  openBtn.addEventListener('click', onOpen);
  actions.appendChild(openBtn);

  if (kebabActions.length) actions.appendChild(createKebabMenu(kebabActions));

  return card;
}
