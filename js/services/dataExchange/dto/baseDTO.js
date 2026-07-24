// dto/baseDTO.js
// Every specific DTO factory composes this: stamps the entity type and
// deep-freezes the result, so DTOs are immutable and self-describing
// regardless of which format (XML/CSV/Excel/JSON) they came from or are
// going to.

import { deepFreeze } from '../shared/freezeDeep.js';

export function createDTO (type, fields) {
  return deepFreeze({ __dtoType: type, ...fields });
}
