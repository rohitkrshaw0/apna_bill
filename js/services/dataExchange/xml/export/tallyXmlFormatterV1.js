// xml/export/tallyXmlFormatterV1.js
// Implements 9A's formatters/contract.js IFormatter. Owns EVERY Tally-
// specific structural decision -- the ENVELOPE/HEADER/BODY/IMPORTDATA/
// REQUESTDESC/REQUESTDATA envelope, TALLYMESSAGE ordering, the `.LIST`
// suffix convention, GST-rate splitting, enum-string encoding, the
// PARENT="Sundry Debtors/Creditors" and PARTYLEDGERNAME="Cash Sale"
// literals, and the GROUP/UNIT/CURRENCY structural scaffolding that isn't
// backed by any DTO at all. Mappers (export/mapping/**) never see any of
// this -- they only produce plain DTOs, which is what keeps this file
// swappable: a future Tally revision or a different ERP dialect is a new
// formatter implementing the same IFormatter contract, never an edit here.
//
// format() is async, like 9B's tallyXmlParser.parse(), so a large TALLYMESSAGE
// list can yield back to the event loop periodically -- same "Streaming"
// rationale as the import side: no new dependency, no true streaming
// serializer, just batched building instead of one long synchronous loop.

import { xmlElement, xmlText, serialize } from './tallyXmlWriter.js';
import { codeToStateName } from '../mapping/stateCodes.js';
import { CASH_SALE_LITERAL } from '../mapping/masters/partyMapper.js';
import { createVersion } from '../../shared/version/index.js';

const BATCH_SIZE = 200;
const GODOWN_NAME = 'Main Location'; // ApnaBill has no godown/location concept; fixed default, not real data
const DEFAULT_BATCH_NAME = 'Primary Batch';

export function getFormatVersion () {
  return createVersion({ major: 1, minor: 0, patch: 0, label: 'tally-xml' });
}

async function maybeYield (i) {
  if ((i + 1) % BATCH_SIZE === 0) await Promise.resolve();
}

function el (tag, attrs, children) { return xmlElement(tag, attrs, children); }
function txt (tag, value) { return xmlText(tag, value); }

function formatTallyDate (isoDate) {
  return String(isoDate || '').replace(/-/g, '').slice(0, 8);
}

function numberUnit (qty, unit) {
  return `${qty} ${unit || ''}`.trim();
}

// ---------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------

function buildEnvelope (reportName, companyName, tallyMessages) {
  return el('ENVELOPE', [], [
    el('HEADER', [], [txt('TALLYREQUEST', 'Import Data')]),
    el('BODY', [], [
      el('IMPORTDATA', [], [
        el('REQUESTDESC', [], [
          txt('REPORTNAME', reportName),
          el('STATICVARIABLES', [], [txt('SVCURRENTCOMPANY', companyName || '')])
        ]),
        el('REQUESTDATA', [], tallyMessages)
      ])
    ])
  ]);
}

function tallyMessage (children) {
  return el('TALLYMESSAGE', [['xmlns:UDF', 'TallyUDF']], children);
}

// ---------------------------------------------------------------------
// Master entities
// ---------------------------------------------------------------------

function buildCompanyMessage (companyDto) {
  if (!companyDto) return null;
  return tallyMessage([
    el('COMPANY', [], [
      el('REMOTECMPINFO.LIST', [['MERGE', 'Yes']], [
        txt('NAME', ''),
        txt('REMOTECMPNAME', companyDto.name || ''),
        txt('REMOTECMPSTATE', codeToStateName(companyDto.stateCode) || '')
      ])
    ])
  ]);
}

function buildCurrencyMessage () {
  return tallyMessage([
    el('CURRENCY', [['NAME', '₹']], [
      txt('EXPANDEDSYMBOL', 'INR'),
      txt('DECIMALPLACES', '2')
    ])
  ]);
}

function buildUnitMessages (units) {
  return units.map(unit => tallyMessage([el('UNIT', [['NAME', unit], ['RESERVEDNAME', '']], [])]));
}

function buildGroupMessages () {
  return [
    tallyMessage([el('GROUP', [['NAME', 'Current Assets'], ['RESERVEDNAME', 'Current Assets']], [el('PARENT', [], [])])]),
    tallyMessage([el('GROUP', [['NAME', 'Current Liabilities'], ['RESERVEDNAME', 'Current Liabilities']], [el('PARENT', [], [])])]),
    tallyMessage([el('GROUP', [['NAME', 'Sundry Debtors'], ['RESERVEDNAME', 'Sundry Debtors']], [txt('PARENT', 'Current Assets')])]),
    tallyMessage([el('GROUP', [['NAME', 'Sundry Creditors'], ['RESERVEDNAME', 'Sundry Creditors']], [txt('PARENT', 'Current Liabilities')])])
  ];
}

function buildGstDetailsChildren (dto) {
  const hasGst = dto.gstRate > 0;
  const children = [];
  if (dto.hsnSac) children.push(txt('HSNCODE', dto.hsnSac));
  children.push(txt('TAXABILITY', hasGst ? 'Taxable' : 'Exempt'));

  const rateDetails = [];
  if (hasGst) {
    rateDetails.push(el('RATEDETAILS.LIST', [], [txt('GSTRATEDUTYHEAD', 'Central Tax'), txt('GSTRATE', dto.gstRate / 2)]));
    rateDetails.push(el('RATEDETAILS.LIST', [], [txt('GSTRATEDUTYHEAD', 'State Tax'), txt('GSTRATE', dto.gstRate / 2)]));
    rateDetails.push(el('RATEDETAILS.LIST', [], [txt('GSTRATEDUTYHEAD', 'Integrated Tax'), txt('GSTRATE', dto.gstRate)]));
  }
  if (dto.cessRate > 0) {
    rateDetails.push(el('RATEDETAILS.LIST', [], [txt('GSTRATEDUTYHEAD', 'Cess'), txt('GSTRATE', dto.cessRate)]));
  } else {
    rateDetails.push(el('RATEDETAILS.LIST', [], [txt('GSTRATEDUTYHEAD', 'Cess')]));
  }
  children.push(el('STATEWISEDETAILS.LIST', [], rateDetails));
  return children;
}

function buildBatchAllocationChildren (batch, fallbackUnit) {
  const children = [
    txt('GODOWNNAME', GODOWN_NAME),
    txt('BATCHNAME', batch.batchNo || DEFAULT_BATCH_NAME)
  ];
  if (batch.openingQty != null) {
    children.push(txt('OPENINGBALANCE', numberUnit(batch.openingQty, batch.openingUnit || fallbackUnit || '')));
    children.push(txt('OPENINGVALUE', batch.openingValue != null ? batch.openingValue : 0));
  }
  return children;
}

function buildItemMessage ({ dto, openingQty, openingUnit, batches }) {
  const children = [
    el('PARENT', [], []),
    txt('GSTAPPLICABLE', dto.gstRate > 0 ? 'Applicable' : 'Not Applicable'),
    txt('BASEUNITS', dto.unit),
    txt('ISBATCHWISEON', dto.trackBatches ? 'Yes' : 'No')
  ];

  if (openingQty != null) {
    children.push(txt('OPENINGBALANCE', numberUnit(openingQty, openingUnit || dto.unit)));
  }

  if (dto.hsnSac || dto.gstRate > 0 || dto.cessRate > 0) {
    children.push(el('GSTDETAILS.LIST', [], buildGstDetailsChildren(dto)));
  }

  if (dto.trackBatches && batches && batches.length) {
    for (const batch of batches) {
      children.push(el('BATCHALLOCATIONS.LIST', [], buildBatchAllocationChildren(batch, dto.unit)));
    }
  }

  return tallyMessage([el('STOCKITEM', [['NAME', dto.name], ['RESERVEDNAME', '']], children)]);
}

function buildLedgerMessage ({ dto, openingBalance }) {
  const parentGroup = dto.__dtoType === 'customer' ? 'Sundry Debtors' : 'Sundry Creditors';
  const children = [
    txt('PARENT', parentGroup),
    el('MAILINGNAME.LIST', [], [txt('MAILINGNAME', dto.name)])
  ];
  if (dto.stateCode) children.push(txt('LEDSTATENAME', codeToStateName(dto.stateCode) || ''));
  children.push(txt('PARTYGSTIN', dto.gstin || ''));
  children.push(txt('OPENINGBALANCE', openingBalance));

  return tallyMessage([el('LEDGER', [['NAME', dto.name], ['RESERVEDNAME', '']], children)]);
}

// ---------------------------------------------------------------------
// Sales voucher
// ---------------------------------------------------------------------

function buildSalesVoucherMessage ({ dto }) {
  const partyName = dto.customerId ? (dto.meta?.partyName || '') : CASH_SALE_LITERAL;
  const totals = dto.totals || {};

  const ledgerEntries = [
    el('LEDGERENTRIES.LIST', [], [
      txt('LEDGERNAME', partyName),
      txt('ISPARTYLEDGER', 'Yes'),
      txt('AMOUNT', -(totals.grand_total || 0)),
      el('BILLALLOCATIONS.LIST', [], [txt('NAME', dto.invoiceNo || ''), txt('AMOUNT', -(totals.grand_total || 0))])
    ])
  ];

  const inventoryEntries = (dto.lines || []).map(line => {
    const children = [
      txt('STOCKITEMNAME', line.item_name || ''),
      txt('RATE', `${line.rate}/${line.unit || ''}`),
      txt('DISCOUNT', line.discount_amt || 0),
      txt('AMOUNT', line.taxable_value || 0),
      txt('ACTUALQTY', numberUnit(line.qty_paid, line.unit)),
      txt('BILLEDQTY', numberUnit(line.qty_paid, line.unit))
    ];
    if (line.batchNo) {
      children.push(el('BATCHALLOCATIONS.LIST', [], [txt('GODOWNNAME', GODOWN_NAME), txt('BATCHNAME', line.batchNo)]));
    }
    children.push(el('ACCOUNTINGALLOCATIONS.LIST', [], [txt('LEDGERNAME', 'Sales'), txt('AMOUNT', line.taxable_value || 0)]));
    return el('ALLINVENTORYENTRIES.LIST', [], children);
  });

  const taxEntries = dto.meta?.isInterstate
    ? [el('LEDGERENTRIES.LIST', [], [txt('LEDGERNAME', 'IGST'), txt('AMOUNT', totals.igst_total || 0)])]
    : [
        el('LEDGERENTRIES.LIST', [], [txt('LEDGERNAME', 'CGST'), txt('AMOUNT', totals.cgst_total || 0)]),
        el('LEDGERENTRIES.LIST', [], [txt('LEDGERNAME', 'SGST'), txt('AMOUNT', totals.sgst_total || 0)])
      ];
  const adjustmentEntries = [
    el('LEDGERENTRIES.LIST', [], [txt('LEDGERNAME', 'Discount (Sales)'), txt('AMOUNT', -(totals.discount_total || 0))]),
    el('LEDGERENTRIES.LIST', [], [txt('LEDGERNAME', 'Round Off (Sales)'), txt('AMOUNT', totals.round_off || 0)])
  ];

  const children = [
    txt('DATE', formatTallyDate(dto.invoiceDate)),
    txt('PARTYNAME', partyName),
    txt('VOUCHERTYPENAME', 'Sales'),
    txt('REFERENCE', dto.invoiceNo || ''),
    txt('VOUCHERNUMBER', dto.invoiceNo || ''),
    txt('PARTYLEDGERNAME', partyName),
    ...ledgerEntries,
    ...inventoryEntries,
    ...taxEntries,
    ...adjustmentEntries
  ];

  return tallyMessage([el('VOUCHER', [['VCHTYPE', 'Sales'], ['ACTION', 'Create']], children)]);
}

// ---------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------

/**
 * @param {object} exportModel { company: companyDTO|null, items: [{dto,openingQty,openingUnit,batches}], parties: [{dto,openingBalance}] }
 */
export async function formatMasterXml (exportModel) {
  const { company = null, items = [], parties = [] } = exportModel;
  const messages = [];

  const companyMsg = buildCompanyMessage(company);
  if (companyMsg) messages.push(companyMsg);
  messages.push(buildCurrencyMessage());

  const units = Array.from(new Set(items.map(i => i.dto.unit).filter(Boolean))).sort();
  messages.push(...buildUnitMessages(units));
  messages.push(...buildGroupMessages());

  for (let i = 0; i < items.length; i++) {
    messages.push(buildItemMessage(items[i]));
    await maybeYield(i);
  }
  for (let i = 0; i < parties.length; i++) {
    messages.push(buildLedgerMessage(parties[i]));
    await maybeYield(i);
  }

  return serialize(buildEnvelope('All Masters', company?.name, messages));
}

/**
 * @param {object} exportModel { company: companyDTO|null, sales: [{dto}] }
 */
export async function formatVouchersXml (exportModel) {
  const { company = null, sales = [] } = exportModel;
  const messages = [];
  for (let i = 0; i < sales.length; i++) {
    messages.push(buildSalesVoucherMessage(sales[i]));
    await maybeYield(i);
  }
  return serialize(buildEnvelope('Vouchers', company?.name, messages));
}

export function createTallyXmlFormatterV1 () {
  return {
    getFormatVersion,
    format: (exportModel) => (exportModel.kind === 'vouchers' ? formatVouchersXml(exportModel) : formatMasterXml(exportModel))
  };
}
