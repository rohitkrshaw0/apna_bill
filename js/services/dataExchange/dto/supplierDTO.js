// dto/supplierDTO.js
// Format-independent Supplier shape (see customerDTO.js for the note on why
// this stays a distinct DTO from Customer despite sharing storage today).

import { createDTO } from './baseDTO.js';

export function createSupplierDTO ({ id = null, name, phone = null, gstin = null, stateCode = null, address = null, meta = {} } = {}) {
  return createDTO('supplier', { id, name, phone, gstin, stateCode, address, meta });
}
