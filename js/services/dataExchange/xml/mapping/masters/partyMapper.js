// xml/mapping/masters/partyMapper.js
// <LEDGER> -> customerDTO / supplierDTO / unsupported, per its resolved
// GROUP role. See docs/milestone-9b-xml-mapping.md section 3.5.

import { createCustomerDTO } from '../../../dto/customerDTO.js';
import { createSupplierDTO } from '../../../dto/supplierDTO.js';
import { stateNameToCode } from '../stateCodes.js';
import { parseTrimmedNumber } from '../parseHelpers.js';

export const CASH_SALE_LITERAL = 'Cash Sale';

/**
 * @param {object} record a raw LEDGER record from tallyXmlParser
 * @param {object} opts { classifier: ReturnType<createGroupClassifier> }
 * @returns {{ role: 'customer'|'supplier'|'unsupported', name: string|null, dto?: object, openingBalance?: number }}
 */
export function mapLedgerRecord (record, { classifier } = {}) {
  const name = record['@NAME'] || null;
  const parent = typeof record.PARENT === 'string' ? record.PARENT.trim() : null;
  const role = classifier ? classifier.resolveRole(parent) : null;

  if (!role) {
    return { role: 'unsupported', name, parent };
  }

  const stateName = record.LEDSTATENAME || null;
  const openingBalance = record.OPENINGBALANCE != null ? parseTrimmedNumber(record.OPENINGBALANCE) : 0;

  const fields = {
    name,
    phone: null, // no phone field exists anywhere in LEDGER in this export
    gstin: record.PARTYGSTIN || null,
    stateCode: stateName ? stateNameToCode(stateName) : null,
    address: null,
    meta: { source: 'tally-xml', isCashSaleLiteral: name === CASH_SALE_LITERAL }
  };

  const dto = role === 'customer' ? createCustomerDTO(fields) : createSupplierDTO(fields);
  return { role, name, dto, openingBalance };
}
