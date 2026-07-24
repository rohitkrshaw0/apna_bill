import { escapeHtml } from './escape.js';

// A row in the party/supplier picker dialog: name, phone/gstin, and a balance chip.
// balanceHtml is pre-formatted by the caller (e.g. 'Due ' + fmt(bal)) since the
// sign convention and wording differ between customers ("Due"/"Adv") and
// suppliers ("Payable"/"Advance").
//
// `onEdit`, when given, adds a small edit affordance so a picker (e.g.
// purchase.html's supplier picker) can offer "edit this party" inline
// without leaving the picker — the row itself still selects the party on
// click, so the edit hit-target stops propagation to avoid triggering both.
export function createPartyRow ({ name, phone, gstin, balanceHtml = '', balanceOwes = false, onClick, onEdit }) {
  const btn = document.createElement('button');
  btn.className = 'row';
  const bits = [phone, gstin].filter(Boolean).map(escapeHtml).join(' · ');
  btn.innerHTML = `
    <div>
      <div style="font-weight:var(--weight-semibold);color:var(--color-text);">${escapeHtml(name)}</div>
      <div style="font-size:var(--text-12);color:var(--color-text-muted);">${bits}</div>
    </div>
    <div class="bal${balanceOwes ? ' owes' : ''}">${balanceHtml}</div>
    ${onEdit ? `<span class="row-edit" role="button" tabindex="0" aria-label="Edit" title="Edit">${escapeHtml('✎')}</span>` : ''}`;
  btn.addEventListener('click', (e) => {
    if (onEdit && e.target.closest('.row-edit')) { e.stopPropagation(); onEdit(); return; }
    onClick(e);
  });
  // A <span role="button"> (not a real <button>, to avoid nesting one inside
  // this row's own <button> wrapper) doesn't get native keyboard activation
  // for free — tabindex="0" above makes it reachable, this makes Enter/Space
  // actually activate it, same as a real button would.
  if (onEdit) {
    btn.addEventListener('keydown', (e) => {
      if (!e.target.closest('.row-edit')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onEdit(); }
    });
  }
  return btn;
}
