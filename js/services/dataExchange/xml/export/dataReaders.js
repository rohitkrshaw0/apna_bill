// xml/export/dataReaders.js
// The genuinely new unpaginated/looped reads Milestone 9C needs -- items,
// parties, opening stock, and sales-with-lines. None of these exist
// anywhere in js/*.js today (confirmed: no customers.js, no invoice-listing
// function anywhere -- the only existing `invoices` read in the whole app,
// lastCompanyActivity() in supabaseClient.js, selects only `created_at`).
// Reuses everything that DOES already exist: listBatchesForItem (items.js)
// for batch reads, the same select('*') convention every other read uses,
// and the same supa/getActiveCompanyId primitives -- no parallel query layer.
//
// supabaseClient.js/items.js are imported dynamically (not at module
// top-level) for the same reason 9B's xmlImporter.js does this: neither
// pulls in the Supabase SDK's remote CDN import until a read actually runs,
// so nothing that merely *imports* this module (including the offline test
// page, transitively via the xml/index.js barrel) needs network access.

const PAGE_SIZE = 500;

async function deps () {
  const [{ supa, getActiveCompanyId }, { listBatchesForItem }] = await Promise.all([
    import('../../../../supabaseClient.js'),
    import('../../../../items.js')
  ]);
  return { supa, getActiveCompanyId, listBatchesForItem };
}

function chunk (arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchAllPages (buildQuery) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

/** All items for the active company, deterministically ordered by name. */
export async function fetchAllItems ({ activeOnly = true } = {}) {
  const { supa, getActiveCompanyId } = await deps();
  const co = getActiveCompanyId();
  return fetchAllPages((from, to) => {
    let q = supa.from('items').select('*').eq('company_id', co)
      .order('name', { ascending: true }).range(from, to);
    if (activeOnly) q = q.eq('is_active', true);
    return q;
  });
}

/** All parties (customers and/or suppliers) for the active company, ordered by name. */
export async function fetchAllParties ({ activeOnly = true } = {}) {
  const { supa, getActiveCompanyId } = await deps();
  const co = getActiveCompanyId();
  return fetchAllPages((from, to) => {
    let q = supa.from('parties').select('*').eq('company_id', co)
      .order('name', { ascending: true }).range(from, to);
    if (activeOnly) q = q.eq('is_active', true);
    return q;
  });
}

/**
 * Opening-stock data for one item -- batches (via the existing
 * listBatchesForItem) plus, for each, the genuine stock_ledger
 * txn_type='opening' row if one exists. Never fabricates a value: a batch
 * with no such row gets openingQty=null, which the formatter treats as
 * "omit the tag," not "zero" (see the plan's opening-values decision).
 */
export async function fetchOpeningStockForItem (itemId) {
  const { supa, getActiveCompanyId, listBatchesForItem } = await deps();
  const co = getActiveCompanyId();
  const batches = await listBatchesForItem(itemId);

  if (!batches.length) {
    // Non-batch item: look for a single item-level opening row (batch_id is null).
    const { data, error } = await supa.from('stock_ledger')
      .select('qty_in, qty_out, unit_cost')
      .eq('company_id', co).eq('item_id', itemId).is('batch_id', null).eq('txn_type', 'opening')
      .order('txn_date', { ascending: false }).limit(1);
    if (error) throw error;
    const row = data?.[0] || null;
    return { openingQty: row ? Number(row.qty_in) - Number(row.qty_out) : null, openingUnit: null, batches: [] };
  }

  const { data: openingRows, error } = await supa.from('stock_ledger')
    .select('batch_id, qty_in, qty_out, unit_cost')
    .eq('company_id', co).eq('item_id', itemId).eq('txn_type', 'opening')
    .in('batch_id', batches.map(b => b.id));
  if (error) throw error;
  const openingByBatch = new Map((openingRows || []).map(r => [r.batch_id, r]));

  const batchResults = batches.map(b => {
    const opening = openingByBatch.get(b.id);
    const qty = opening ? Number(opening.qty_in) - Number(opening.qty_out) : null;
    return {
      batchNo: b.batch_no || null,
      shade: b.shade || null,
      size: b.size || null,
      openingQty: qty,
      openingValue: qty != null ? qty * (Number(opening.unit_cost) || 0) : null
    };
  });

  const anyKnown = batchResults.some(b => b.openingQty != null);
  const itemOpeningQty = anyKnown ? batchResults.reduce((sum, b) => sum + (b.openingQty || 0), 0) : null;

  return { openingQty: itemOpeningQty, openingUnit: null, batches: batchResults };
}

/**
 * Sales invoices + lines for the active company (optionally scoped to a
 * firm and/or date range), deterministically ordered by invoice_date then
 * invoice_no, lines by line_no. Line reads are chunked by invoice id (not
 * just page-ranged) so a very large export never builds one oversized
 * `.in(...)` filter.
 */
export async function fetchSalesInvoices ({ firmId = null, dateFrom = null, dateTo = null } = {}) {
  const { supa, getActiveCompanyId } = await deps();
  const co = getActiveCompanyId();
  const invoices = await fetchAllPages((from, to) => {
    let q = supa.from('invoices').select('*')
      .eq('company_id', co).eq('doc_type', 'sale')
      .order('invoice_date', { ascending: true }).order('invoice_no', { ascending: true })
      .range(from, to);
    if (firmId) q = q.eq('firm_id', firmId);
    if (dateFrom) q = q.gte('invoice_date', dateFrom);
    if (dateTo) q = q.lte('invoice_date', dateTo);
    return q;
  });
  if (!invoices.length) return [];

  const linesByInvoice = new Map();
  for (const idChunk of chunk(invoices.map(i => i.id), PAGE_SIZE)) {
    const lines = await fetchAllPages((from, to) =>
      supa.from('invoice_lines')
        .select('*, batches(batch_no)')
        .in('invoice_id', idChunk)
        .order('invoice_id', { ascending: true }).order('line_no', { ascending: true })
        .range(from, to)
    );
    for (const line of lines) {
      if (!linesByInvoice.has(line.invoice_id)) linesByInvoice.set(line.invoice_id, []);
      linesByInvoice.get(line.invoice_id).push(line);
    }
  }

  return invoices.map(invoice => ({ invoice, lines: linesByInvoice.get(invoice.id) || [] }));
}
