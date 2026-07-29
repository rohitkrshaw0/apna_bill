// calculators/revenueCalculator.js (Milestone 12C)
// Pure calculation only. Gross sales, sale-returns value, net sales, and
// return rate -- the one genuinely new numeric domain this milestone adds
// (no existing calculator anywhere in this platform distinguishes a
// document's own `docType`, since 12A/12B have no returns concept in their
// own domains). Every function here operates on invoice_line rows already
// enriched with `docType` by sales/salesDataLoader.js.
//
// Known, disclosed limitation (see sales/salesDataLoader.js's own header
// comment): no workflow in this ERP currently writes a 'sale_return' row,
// so `calculateReturnRate` will read 0 for every real company today --
// this is a property of the source data, not a bug in this calculator.

/** @param {object[]} lines invoice_line rows @returns {number} sum(lineTotal) where docType === 'sale' */
export function calculateGrossSales (lines) {
  return lines
    .filter((l) => l.docType === 'sale')
    .reduce((sum, l) => sum + (l.lineTotal || 0), 0);
}

/** @param {object[]} lines invoice_line rows @returns {number} sum(lineTotal) where docType === 'sale_return' */
export function calculateReturnsValue (lines) {
  return lines
    .filter((l) => l.docType === 'sale_return')
    .reduce((sum, l) => sum + (l.lineTotal || 0), 0);
}

/** @param {object[]} lines invoice_line rows @returns {number} calculateGrossSales(lines) - calculateReturnsValue(lines) */
export function calculateNetSales (lines) {
  return calculateGrossSales(lines) - calculateReturnsValue(lines);
}

/** @param {object[]} lines invoice_line rows @returns {number} net units sold: sum(qty) where 'sale' minus sum(qty) where 'sale_return' */
export function calculateNetUnitsSold (lines) {
  const sold = lines.filter((l) => l.docType === 'sale').reduce((sum, l) => sum + (l.qty || 0), 0);
  const returned = lines.filter((l) => l.docType === 'sale_return').reduce((sum, l) => sum + (l.qty || 0), 0);
  return sold - returned;
}

/**
 * @param {object[]} lines invoice_line rows
 * @returns {number|null} returned qty / sold qty, as a fraction (0..1), or null when nothing was sold to compare against
 */
export function calculateReturnRate (lines) {
  const sold = lines.filter((l) => l.docType === 'sale').reduce((sum, l) => sum + (l.qty || 0), 0);
  if (sold <= 0) return null;
  const returned = lines.filter((l) => l.docType === 'sale_return').reduce((sum, l) => sum + (l.qty || 0), 0);
  return returned / sold;
}
