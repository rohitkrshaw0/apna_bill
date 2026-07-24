// xml/export/mapping/masters/partyExportMapper.js
// ERP-agnostic: party row -> customerDTO/supplierDTO, plus the opening-
// balance sibling (parties.opening_balance -- genuine, permanently-stored,
// set once at creation, never touched again; see openingBalanceWriter.js).
// No Tally tag names, no PARENT/"Sundry Debtors" literal -- that's
// tallyXmlFormatterV1.js's job, made from dto.__dtoType alone.
//
// A party's is_customer/is_supplier flags aren't mutually exclusive in the
// schema (though every write path in this app only ever sets one), so this
// returns an array -- almost always length 1, length 2 only for the
// (currently unreachable via the app's own UI) case of a party flagged as
// both, so that data is never silently dropped.

import { createCustomerDTO } from '../../../../dto/customerDTO.js';
import { createSupplierDTO } from '../../../../dto/supplierDTO.js';

/** @param {object} party a row from the `parties` table */
export function mapPartyToExportDTOs (party) {
  const fields = {
    id: party.id,
    name: party.name,
    phone: party.phone || null,
    gstin: party.gstin || null,
    stateCode: party.state_code || null,
    address: party.address || null,
    meta: { source: 'apnabill' }
  };
  const openingBalance = Number(party.opening_balance) || 0;

  const results = [];
  if (party.is_customer) results.push({ dto: createCustomerDTO(fields), openingBalance });
  if (party.is_supplier) results.push({ dto: createSupplierDTO(fields), openingBalance });
  return results;
}
