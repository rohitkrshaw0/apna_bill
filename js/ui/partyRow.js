import { escapeHtml } from './escape.js';

// A row in the party/supplier picker dialog: name, phone/gstin, and a balance chip.
// balanceHtml is pre-formatted by the caller (e.g. 'Due ' + fmt(bal)) since the
// sign convention and wording differ between customers ("Due"/"Adv") and
// suppliers ("Payable"/"Advance").
export function createPartyRow ({ name, phone, gstin, balanceHtml = '', balanceOwes = false, onClick }) {
  const btn = document.createElement('button');
  btn.className = 'row';
  const bits = [phone, gstin].filter(Boolean).map(escapeHtml).join(' · ');
  btn.innerHTML = `
    <div>
      <div style="font-weight:600;color:var(--ink);">${escapeHtml(name)}</div>
      <div style="font-size:12px;color:var(--muted-ink);">${bits}</div>
    </div>
    <div class="bal${balanceOwes ? ' owes' : ''}">${balanceHtml}</div>`;
  btn.addEventListener('click', onClick);
  return btn;
}
