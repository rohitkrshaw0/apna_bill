// dto/companyDTO.js
// Format-independent Company shape.

import { createDTO } from './baseDTO.js';

export function createCompanyDTO ({ id = null, name, gstin = null, address = null, stateCode = null, meta = {} } = {}) {
  return createDTO('company', { id, name, gstin, address, stateCode, meta });
}
