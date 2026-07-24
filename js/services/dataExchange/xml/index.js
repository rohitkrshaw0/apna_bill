// services/dataExchange/xml/index.js
// Public barrel for the Tally-XML import engine (Milestone 9B). A future
// settings/import screen imports from here rather than reaching into
// individual subfolders, same convention as services/dataExchange/index.js.

export { createTallyXmlParser } from './tallyXmlParser.js';
export { checkXmlSecurity, MAX_XML_BYTES } from './security/xmlSecurity.js';
export { detectEncoding, decodeXmlBuffer } from './encoding/detectEncoding.js';

export { stateNameToCode } from './mapping/stateCodes.js';
export { createGroupClassifier } from './mapping/groupClassifier.js';
export { mapStockItemRecord } from './mapping/masters/itemMapper.js';
export { mapLedgerRecord, CASH_SALE_LITERAL } from './mapping/masters/partyMapper.js';
export { mapCompanyRecord } from './mapping/masters/companyMapper.js';
export { createVoucherDispatcher } from './mapping/vouchers/voucherDispatcher.js';
export { mapSalesVoucherRecord, BY_NAME_PREFIX } from './mapping/vouchers/salesVoucherMapper.js';

export {
  requiredFieldsRule, dateFormatRule, quantitySplitRule,
  gstRateCrossCheckRule, ledgerBalanceRule, referencedEntitiesRule
} from './validators/xmlBusinessRules.js';
export {
  duplicateItemNameDetector, duplicateLedgerNameDetector, duplicateInvoiceNumberDetector
} from './conflicts/xmlConflictDetectors.js';

export { writeOpeningBalance } from './writers/openingBalanceWriter.js';
export { writeOpeningStock } from './writers/openingStockWriter.js';

export { buildXmlImportPlan, createXmlImporter } from './xmlImporter.js';
