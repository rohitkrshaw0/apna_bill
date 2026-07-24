// xml/mapping/masters/companyMapper.js
// <COMPANY> -> companyDTO. Confirmation-only per the plan's decision 1 --
// this DTO is never written; it exists so the importer can show "This file
// is for '{name}' -- you're currently in '{active company}'. Continue?"
// See docs/milestone-9b-xml-mapping.md section 3.1 / 7.1.

import { createCompanyDTO } from '../../../dto/companyDTO.js';
import { stateNameToCode } from '../stateCodes.js';

function listOf (value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function mapCompanyRecord (record) {
  const info = listOf(record['REMOTECMPINFO.LIST'])[0] || {};
  const name = info.REMOTECMPNAME || null;
  const stateName = info.REMOTECMPSTATE || null;

  return createCompanyDTO({
    name,
    stateCode: stateName ? stateNameToCode(stateName) : null,
    meta: { source: 'tally-xml', rawStateName: stateName }
  });
}
