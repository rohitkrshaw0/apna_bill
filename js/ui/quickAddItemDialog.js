// Wires the "Quick add item" dialog (#dlg-quick-item) shared verbatim by sale.html,
// purchase.html and manufacturing.html: kind toggle, GST quick-pick, barcode generator,
// submit -> createItem. The dialog's own markup stays inline in each page (it's
// identical HTML either way).
//
// onCreated(item, target) is called after the item is created; `target` is whatever
// was passed to open(term, target) — sale/purchase ignore it (always add to cart),
// manufacturing uses it to route to either the produced-item slot or the materials cart.
import { generateBarcodeCode } from './barcode.js';

export function initQuickAddItemDialog ({ createItem, toast, onCreated }) {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  let currentTarget;

  function setQuickKind (kind) {
    $('#qi-kind-goods').classList.toggle('active', kind === 'goods');
    $('#qi-kind-service').classList.toggle('active', kind === 'service');
    const isService = kind === 'service';
    $('#qi-stock-group').classList.toggle('hidden', isService);
    if (isService) { $('#qi-track-stock').checked = false; $('#qi-track-batches').checked = false; }
  }
  function currentQuickKind () { return $('#qi-kind-service').classList.contains('active') ? 'service' : 'goods'; }

  function open (term, target) {
    currentTarget = target;
    $('#results').classList.remove('open');
    $('#qi-name').value = term;
    setQuickKind('goods');
    $('#qi-unit').value = 'PCS';
    $('#qi-hsn').value = '';
    $('#qi-code').value = '';
    $('#qi-gst').value = 5;
    $$('#qi-gst-quick button').forEach(b => b.classList.toggle('active', b.dataset.rate === '5'));
    $('#qi-track-stock').checked = true;
    $('#qi-track-batches').checked = true;
    $('#dlg-quick-item').showModal();
  }

  $('#qi-code-gen').addEventListener('click', () => {
    const code = generateBarcodeCode();
    $('#qi-code').value = code;
    navigator.clipboard?.writeText(code).catch(() => {});
    toast('Barcode generated: ' + code, 'ok', 2500);
  });
  $('#qi-kind-goods').addEventListener('click', () => setQuickKind('goods'));
  $('#qi-kind-service').addEventListener('click', () => setQuickKind('service'));
  $$('#qi-gst-quick button').forEach(b => {
    b.addEventListener('click', () => {
      $('#qi-gst').value = b.dataset.rate;
      $$('#qi-gst-quick button').forEach(x => x.classList.toggle('active', x === b));
    });
  });
  $('#qi-cancel').addEventListener('click', () => $('#dlg-quick-item').close());
  $('#quick-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#qi-name').value.trim();
    if (!name) { toast('Item name is required', 'warn'); return; }
    const kind = currentQuickKind();
    try {
      const item = await createItem({
        name, kind,
        code: $('#qi-code').value.trim() || null,
        unit: $('#qi-unit').value.trim() || 'PCS',
        hsn_sac: $('#qi-hsn').value.trim() || null,
        gst_rate: +$('#qi-gst').value || 0,
        cess_rate: 0,
        is_price_inclusive: false,
        default_retail_price: 0,
        default_wholesale_price: 0,
        default_purchase_price: 0,
        track_stock: kind === 'service' ? false : $('#qi-track-stock').checked,
        track_batches: kind === 'service' ? false : $('#qi-track-batches').checked,
        low_stock_threshold: 0,
        is_active: true
      });
      $('#dlg-quick-item').close();
      // Whichever search box was in play (#item-search, or manufacturing's separate
      // #produced-search) gets cleared by the caller's own add/select handler.
      await onCreated(item, currentTarget);
    } catch (err) {
      const msg = err.code === '23505'
        ? 'That code / barcode is already used by another item — try a different one.'
        : err.message;
      toast('Could not create item: ' + msg, 'warn');
    }
  });

  return { open };
}
