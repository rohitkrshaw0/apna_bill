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
      <div style="font-weight:600;color:var(--ink);">${escapeHtml(name)}</div>
      <div style="font-size:12px;color:var(--muted-ink);">${bits}</div>
    </div>
    <div class="bal${balanceOwes ? ' owes' : ''}">${balanceHtml}</div>
    ${onEdit ? `<span class="row-edit" role="button" aria-label="Edit" title="Edit">${escapeHtml('✎')}</span>` : ''}`;
  btn.addEventListener('click', (e) => {
    if (onEdit && e.target.closest('.row-edit')) { e.stopPropagation(); onEdit(); return; }
    onClick(e);
  });
  return btn;
}
