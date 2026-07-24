// xml/mapping/groupClassifier.js
// Resolves a LEDGER's <PARENT> group name up Tally's 2-level chart-of-accounts
// (via GROUP.PARENT chains) to 'customer' (Sundry Debtors), 'supplier'
// (Sundry Creditors), or null (any other group — no ApnaBill equivalent).
// See docs/milestone-9b-xml-mapping.md §3.5.

const CUSTOMER_GROUP = 'Sundry Debtors';
const SUPPLIER_GROUP = 'Sundry Creditors';

export function createGroupClassifier (groupRecords = []) {
  const parentByName = new Map();
  for (const g of groupRecords) {
    const name = typeof g['@NAME'] === 'string' ? g['@NAME'].trim() : null;
    if (!name) continue;
    const parent = typeof g.PARENT === 'string' && g.PARENT.trim() ? g.PARENT.trim() : null;
    parentByName.set(name, parent);
  }

  /** @returns {'customer'|'supplier'|null} */
  function resolveRole (ledgerParentGroupName) {
    let current = typeof ledgerParentGroupName === 'string' && ledgerParentGroupName.trim()
      ? ledgerParentGroupName.trim() : null;
    const seen = new Set();
    while (current) {
      if (current === CUSTOMER_GROUP) return 'customer';
      if (current === SUPPLIER_GROUP) return 'supplier';
      if (seen.has(current)) return null; // cycle guard — shouldn't occur in real Tally data
      seen.add(current);
      current = parentByName.has(current) ? parentByName.get(current) : null;
    }
    return null;
  }

  return { resolveRole };
}
