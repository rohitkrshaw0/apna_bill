// json/shared/entityManifest.js
// The ONE canonical list of entity types this JSON format engine supports --
// deliberately a single source of truth, unlike .apnabill's own 21-table
// list, which docs/milestone-9f-migration-report.md section 3.5 records as
// six independent copies (each file's own comment admitting it as a
// deliberate-but-regrettable trade-off). Both jsonExporter.js and
// jsonImporter.js import this file rather than re-declaring their own
// version of it.
//
// Scope: item/customer/supplier/sale -- exactly what xml/ already supports
// end-to-end (Sales vouchers only; Purchase/Manufacturing/Stock/Settings
// DTOs exist under dto/ since 9A but have no reader/mapper/writer anywhere
// in this platform yet, XML included). See milestone-10-json-design.md
// section 4 for why this milestone keeps the same scope rather than
// inventing new, unreviewed data-access logic.

import { deepFreeze } from '../../shared/freezeDeep.js';

/** dtoType -> the envelope's plural JSON key for that entity's array. */
export const ENTITY_PLURAL_KEYS = deepFreeze({
  item: 'items',
  customer: 'customers',
  supplier: 'suppliers',
  sale: 'sales'
});

export const ENTITY_TYPES = deepFreeze(Object.keys(ENTITY_PLURAL_KEYS));

/** [node, dependsOn] pairs -- identical to xmlImporter.js's fixed ordering (a sale needs its item/customer/supplier to exist first). */
export const DEPENDENCY_EDGES = deepFreeze([
  ['sale', 'item'],
  ['sale', 'customer'],
  ['sale', 'supplier']
]);

export function pluralKeyFor (entityType) {
  return ENTITY_PLURAL_KEYS[entityType] || null;
}
