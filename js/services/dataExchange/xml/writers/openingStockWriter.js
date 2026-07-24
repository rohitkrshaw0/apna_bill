// xml/writers/openingStockWriter.js
// NEW, additive: calls the record_opening_stock RPC (xml_import_rpc.sql).
// For a batch-tracked item, writes one call per BATCHALLOCATIONS.LIST entry
// (falling back to a single implicit batch when none were present); for a
// non-batch item, one aggregate call.
//
// supabaseClient.js is imported dynamically -- see openingBalanceWriter.js's
// header comment for why.

export async function writeOpeningStock ({ itemId, trackBatches, openingQty, batches = [] }) {
  const { supa, getActiveCompanyId } = await import('../../../../supabaseClient.js');
  const co = getActiveCompanyId();

  if (!trackBatches) {
    const { data, error } = await supa.rpc('record_opening_stock', {
      payload: { company_id: co, item_id: itemId, qty: Number(openingQty) || 0 }
    });
    if (error) throw error;
    return [data];
  }

  const batchList = batches.length ? batches : [{ batchNo: null, openingQty: openingQty || 0, openingValue: 0 }];
  const results = [];
  for (const b of batchList) {
    const qty = Number(b.openingQty) || 0;
    const costPrice = b.openingValue && qty ? b.openingValue / qty : 0;
    const { data, error } = await supa.rpc('record_opening_stock', {
      payload: {
        company_id: co, item_id: itemId,
        batch_no: b.batchNo || null, shade: null, size: null,
        mrp: null, cost_price: costPrice, qty
      }
    });
    if (error) throw error;
    results.push(data);
  }
  return results;
}
