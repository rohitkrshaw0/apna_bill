// providers/manufacturingPostingProvider.js
// The Manufacturing automatic posting provider (Milestone 15B). Per the
// transaction-flow audit behind the design review, create_manufacturing's
// own RPC return (total_material_cost, total_cost) is a complete,
// self-balancing entry -- overhead_cost is derivable as
// total_cost - total_material_cost, so it never needs to be passed
// separately and the entry balances by construction, not by convention.
//
// sourceData shape (built by manufacturing.js after create_manufacturing succeeds):
//   { date, runNo, totalMaterialCost, totalCost }
//
// ---------------------------------------------------------------------
// WHY BOTH SIDES OF THE MATERIAL MOVEMENT USE THE SAME ACCOUNT ROLE
// ---------------------------------------------------------------------
// schema.sql models stock as one company-wide pool (batches/stock_ledger
// have no raw-material-vs-finished-goods distinction) -- consuming and
// producing both move value through the same Inventory asset account.
// Absorption of overhead into that produced value is what the second
// credit line (Manufacturing Overhead) records.

import { createPostingProviderDefinition } from '../contracts/postingProviderContract.js';
import { VOUCHER_TYPES, POSTING_SOURCES } from '../contracts/journalContract.js';
import { ACCOUNT_ROLES } from '../resolution/accountResolutionContract.js';
import { amountLine } from './postingProviderHelpers.js';
import { postingProviderRegistry } from '../index.js';

/**
 * @param {object} sourceData see file header
 * @param {{resolver: ReturnType<import('../resolution/accountResolutionService.js').createAccountResolutionService>}} deps
 * @returns {{date: string, reference: string|null, narration: string|null, lines: object[], metadata: object}}
 */
export function buildManufacturingJournalEntry (sourceData, { resolver }) {
  const { date, runNo = null, totalMaterialCost, totalCost } = sourceData || {};
  if (!date) throw new TypeError('buildManufacturingJournalEntry: sourceData.date is required');
  if (totalMaterialCost == null || totalCost == null) {
    throw new TypeError('buildManufacturingJournalEntry: sourceData.totalMaterialCost and totalCost are required');
  }

  const materialCost = Math.round(totalMaterialCost * 100) / 100;
  const producedCost = Math.round(totalCost * 100) / 100;
  const overheadCost = Math.round((producedCost - materialCost) * 100) / 100;

  if (overheadCost < 0) {
    // Should be unreachable given manufacturing_rpc.sql's own arithmetic
    // (total_cost = total_material_cost + overhead_cost, overhead_cost >= 0
    // by that RPC's own input) -- surfaced loudly rather than silently
    // building an entry the DB balance assertion would reject anyway.
    throw new TypeError(`buildManufacturingJournalEntry: total_cost (${producedCost}) is less than total_material_cost (${materialCost})`);
  }

  const lines = [];
  const needsInventoryAccount = producedCost > 0 || materialCost > 0;
  const inventoryAccountId = needsInventoryAccount ? resolver.resolve(ACCOUNT_ROLES.INVENTORY_ACCOUNT) : null;

  const produced = amountLine(inventoryAccountId, 'debit', producedCost);
  if (produced) lines.push(produced);
  const consumed = amountLine(inventoryAccountId, 'credit', materialCost);
  if (consumed) lines.push(consumed);

  if (overheadCost > 0) {
    lines.push(amountLine(resolver.resolve(ACCOUNT_ROLES.MANUFACTURING_OVERHEAD_ACCOUNT), 'credit', overheadCost));
  }

  return {
    date,
    reference: runNo,
    narration: runNo ? `Manufacturing run ${runNo}` : null,
    lines,
    metadata: {}
  };
}

export const manufacturingPostingProviderDefinition = createPostingProviderDefinition({
  id: 'manufacturingPostingProvider',
  name: 'Manufacturing',
  description: 'Posts a balanced journal entry for a manufacturing run: produced inventory value against consumed material and absorbed overhead.',
  sourceModule: POSTING_SOURCES.MANUFACTURING,
  voucherTypes: [VOUCHER_TYPES.MANUFACTURING],
  buildJournalEntry: buildManufacturingJournalEntry
});

/** Idempotent -- see salesPostingProvider.js's own registration comment. */
export function registerManufacturingPostingProvider () {
  if (!postingProviderRegistry.has(manufacturingPostingProviderDefinition.id)) {
    postingProviderRegistry.register(manufacturingPostingProviderDefinition);
  }
  return manufacturingPostingProviderDefinition;
}
