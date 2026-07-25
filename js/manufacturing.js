// =====================================================================
// manufacturing.js (v4)
// =====================================================================

import { supa, getActiveCompanyId, getActiveFirmId } from './supabaseClient.js';
import { eventBus, EVENT_TYPES } from './services/events/index.js';

// Rounds each line to 2 decimals before summing — matches create_manufacturing's
// numeric(14,2) line_cost accumulation in manufacturing_rpc.sql exactly, so this
// preview never drifts a paisa from what actually gets saved.
export function previewMfgCost (consumed, overhead, producedQty) {
  let material = 0;
  for (const c of consumed) {
    const lineCost = Math.round((+c.qty || 0) * (+c.unit_cost || 0) * 100) / 100;
    material += lineCost;
  }
  material = Math.round(material * 100) / 100;
  const total = material + (+overhead || 0);
  const perUnit = producedQty > 0 ? total / producedQty : 0;
  return {
    total_material_cost: material,
    total_cost:          +total.toFixed(2),
    cost_per_unit:       +perUnit.toFixed(2)
  };
}

export async function createManufacturing (run) {
  const co = getActiveCompanyId();
  const fm = getActiveFirmId();
  if (!co) throw new Error('No active company');
  if (!fm) throw new Error('No active firm');

  const payload = {
    company_id:       co,
    firm_id:          fm,
    run_date:         run.run_date || null,
    produced_item_id: run.produced_item_id,
    produced_qty:     +run.produced_qty || 0,
    overhead_cost:    +run.overhead_cost || 0,
    produced_batch: run.produced_batch ? {
      batch_no: run.produced_batch.batch_no || null,
      shade:    run.produced_batch.shade || null,
      size:     run.produced_batch.size || null,
      mrp:      run.produced_batch.mrp != null ? +run.produced_batch.mrp : null
    } : null,
    consumed: (run.consumed || []).map(c => ({
      item_id:   c.item_id,
      item_name: c.item_name || null,
      batch_id:  c.batch_id || null,
      qty:       +c.qty || 0,
      unit_cost: c.unit_cost != null ? +c.unit_cost : null
    })),
    notes: run.notes || null
  };

  const { data, error } = await supa.rpc('create_manufacturing', { payload });
  if (error) throw error;
  // Milestone 11B: only ManufacturingCompleted is published here, not
  // ManufacturingStarted -- create_manufacturing is one atomic RPC with no
  // genuine, observable "started but not yet completed" state; publishing
  // both back-to-back would be an artificial split this milestone's brief
  // explicitly forbids inventing. ManufacturingStarted stays registered,
  // unpublished, until a real multi-phase manufacturing workflow exists.
  eventBus.publish(EVENT_TYPES.MANUFACTURING_COMPLETED, {
    aggregateId: data.run_id,
    payload: { runNo: data.run_no, producedItemId: run.produced_item_id },
    context: { company: co, module: 'manufacturing' }
  });
  return data;
}
