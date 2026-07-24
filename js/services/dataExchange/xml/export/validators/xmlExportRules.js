// xml/export/validators/xmlExportRules.js
// Reuses the import-side rules directly wherever they apply -- they already
// operate on the same DTO shapes 9A defines, regardless of which direction
// produced the DTO. Only one new rule is added, and only because it is
// genuinely export-only: import's duplicate detection runs through 9A's
// conflict *engine* (existing DB rows vs incoming), a different mechanism
// entirely, comparing against a *different* company than the one being
// exported -- it never checks a batch against itself. `quantitySplitRule` is
// deliberately NOT reused: it checks a text-parse-failure flag
// (`__rateUnparseable`) that only has meaning when the source was XML text;
// export reads already-typed DB numerics, so that failure mode cannot occur.

import {
  requiredFieldsRule, dateFormatRule, gstRateCrossCheckRule, referencedEntitiesRule
} from '../../validators/xmlBusinessRules.js';
import { createDataExchangeError } from '../../../shared/errors/dataExchangeError.js';
import { ERROR_CATEGORY } from '../../../shared/errors/index.js';
import { SEVERITY } from '../../../shared/severity.js';

export { requiredFieldsRule, dateFormatRule, gstRateCrossCheckRule, referencedEntitiesRule };

function err (message, entity, field) {
  return createDataExchangeError({ message, category: ERROR_CATEGORY.DUPLICATE, severity: SEVERITY.ERROR, entity, field, source: 'xml/export/xmlExportRules' });
}

function normalizeName (s) { return String(s ?? '').trim().toLowerCase(); }

// `items.name` and `parties.name` carry no unique constraint in schema.sql
// (only `items.code` is unique) -- but Tally's STOCKITEM/LEDGER NAME *is*
// effectively an identity key. Two ApnaBill records validly sharing a name
// would silently collide in the exported file; this catches that before
// generation rather than shipping a file where the second record clobbers
// the first on the Tally side.
export function duplicateNameWithinBatchRule (dtoList) {
  const errors = [];
  const seenByType = new Map(); // dtoType -> Map(normalizedName -> first dto)

  for (const dto of dtoList) {
    if (dto.__dtoType !== 'item' && dto.__dtoType !== 'customer' && dto.__dtoType !== 'supplier') continue;
    if (!seenByType.has(dto.__dtoType)) seenByType.set(dto.__dtoType, new Map());
    const seen = seenByType.get(dto.__dtoType);
    const key = normalizeName(dto.name);
    if (!key) continue;
    if (seen.has(key)) {
      errors.push(err(`Two ${dto.__dtoType}s named "${dto.name}" would collide in the exported file (Tally's NAME is an identity key)`, dto.__dtoType, 'name'));
    } else {
      seen.set(key, dto);
    }
  }

  return { errors };
}
