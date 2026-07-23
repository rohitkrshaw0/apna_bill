// dto/customerDTO.js
// Format-independent Customer shape. The existing app stores customers and
// suppliers as one "party" table distinguished by role -- this DTO layer
// keeps them as separate business concepts (per spec), independent of that
// storage detail.

import { createDTO } from './baseDTO.js';

export function createCustomerDTO ({ id = null, name, phone = null, gstin = null, stateCode = null, address = null, meta = {} } = {}) {
  return createDTO('customer', { id, name, phone, gstin, stateCode, address, meta });
}
