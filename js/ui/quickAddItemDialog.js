// Wires the "Quick add item" dialog (#dlg-quick-item) shared by sale.html,
// purchase.html and manufacturing.html: kind toggle, GST quick-pick, barcode
// generator, submit -> createItem.
//
// The dialog's outer shell (heading, sub-text, kind-toggle, sheet-actions)
// stays inline in each page's HTML — same reason items.html leaves its own
// kind-toggle hand-written: no segmentedField component exists yet. The
// dialog's actual FIELDS (name, unit, hsn, code+generate, GST rate,
// track-stock/track-batches) are rendered once, here, via the Form
// Framework, into three empty containers every page must provide:
//   #qi-name-grid   — the (disabled) item-name field
//   #qi-fields-grid — unit / hsn / code+generate / GST rate
//   #qi-stock-grid  — the two track-stock/track-batches checkboxes
// This is the one shared markup contract every consumer of this module
// follows. There is no per-page branching anywhere in this file — the same
// three containers are rendered into unconditionally, regardless of which
// page instantiated the dialog.
//
// onCreated(item, target) is called after the item is created; `target` is
// whatever was passed to open(term, target) — sale/purchase ignore it
// (always add to cart), manufacturing uses it to route to either the
// produced-item slot or the materials cart. Rendering/wiring lives here;
// what "created" means to the caller does not.
import { generateBarcodeCode } from './barcode.js';
import { textField, gstRateField, checkboxField, renderFieldsInto } from './forms/index.js';

export function initQuickAddItemDialog ({ createItem, toast, onCreated }) {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  let currentTarget;

  renderQuickAddItemFields();

  function renderQuickAddItemFields () {
    const nameField = textField({ id: 'qi-name', label: 'Item name', disabled: true });
    renderFieldsInto($('#qi-name-grid'), [nameField]);

    const unitField = textField({ id: 'qi-unit', label: 'Unit', value: 'PCS', list: 'qi-units' });
    const hsnField = textField({ id: 'qi-hsn', label: 'HSN / SAC' });
    const codeField = textField({
      id: 'qi-code', label: 'Code / SKU (barcode)', className: 'full',
      trailing: '<button type="button" class="btn-gen" id="qi-code-gen" title="Generate barcode">⚡</button>'
    });
    const gstField = gstRateField({ id: 'qi-gst', className: 'full', value: 5 });
    renderFieldsInto($('#qi-fields-grid'), [unitField, hsnField, codeField, gstField]);

    const trackStockField = checkboxField({ id: 'qi-track-stock', label: 'Track stock', value: true, className: 'full' });
    const trackBatchesField = checkboxField({ id: 'qi-track-batches', label: 'Track batches (shade / size / MRP)', value: true, className: 'full' });
    renderFieldsInto($('#qi-stock-grid'), [trackStockField, trackBatchesField]);
  }

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
    $$('#qi-gst-quick button').forEach(b => b.classList.toggle('active', b.dataset.pick === '5'));
    $('#qi-track-stock').checked = true;
    $('#qi-track-batches').checked = true;
    $('#dlg-quick-item').showModal();
    $('#qi-name').focus();
  }

  $('#qi-code-gen').addEventListener('click', () => {
    const code = generateBarcodeCode();
    $('#qi-code').value = code;
    navigator.clipboard?.writeText(code).catch(() => {});
    toast('Barcode generated: ' + code, 'ok', 2500);
  });
  $('#qi-kind-goods').addEventListener('click', () => setQuickKind('goods'));
  $('#qi-kind-service').addEventListener('click', () => setQuickKind('service'));
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
