// xml/export/mapping/masters/companyExportMapper.js
// ERP-agnostic: active firm row -> companyDTO. No Tally tag names, no XML
// structure -- that's tallyXmlFormatterV1.js's job. Uses the firm (not the
// parent `companies` row) because `companies` has no state_code/gstin
// column; `firms` does -- the same reasoning 9B's import-side
// companyMapper.js documents for decision 1.

import { createCompanyDTO } from '../../../../dto/companyDTO.js';

/** @param {object} firm a row from the `firms` table */
export function mapFirmToCompanyDTO (firm) {
  return createCompanyDTO({
    id: firm.id,
    name: firm.legal_name || firm.name,
    gstin: firm.gstin || null,
    address: firm.address || null,
    stateCode: firm.state_code || null,
    meta: { source: 'apnabill', firmId: firm.id, phone: firm.phone || null, email: firm.email || null }
  });
}
