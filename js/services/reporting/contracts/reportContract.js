// contracts/reportContract.js
// The one, permanent shape every report registration conforms to
// (Milestone 14A "Report Definition Contracts" / "Report Metadata"). Pure
// metadata + declared capability -- no calculation, no data query, no
// render function. A future report screen (14B+) owns its own rendering;
// this contract only describes what the report IS so the registry, the
// hub page, and a future filter bar can discover and present it
// generically.
//
// `filters` names which of this platform's own shared filter controls
// (filters/dateRangePresets.js's presets, or an existing js/ui/searchInput.js
// /forms selectField a report's own screen wires up) this report declares
// support for -- a list of KEYS, never a custom per-report filter
// implementation smuggled in through this contract.
//
// `requiredCapability` is carried, validated, and unenforced -- see
// docs/architecture/reporting-platform-architecture.md's own "Permissions"
// section and ADR-0003 for why: there is no roles/permissions model
// anywhere in this application to gate against, and Authentication is
// frozen for this milestone. This field exists so the plumbing (contract
// -> registry -> context) is real and ready for whichever future
// milestone adds a real authorization model -- the same "declared, not
// yet enforced" shape this codebase already uses for the Job Engine's
// unused CANCELLED state and Business Intelligence's unwired
// DashboardCardProvider capability.

import { deepFreeze } from '../shared/freezeDeep.js';

export const REPORT_CATEGORIES = deepFreeze({
  SALES: 'sales',
  PURCHASE: 'purchase',
  INVENTORY: 'inventory',
  SUPPLIER: 'supplier',
  CUSTOMER: 'customer',
  BUSINESS_INTELLIGENCE: 'businessIntelligence'
});

// Metadata only -- 14A wires no actual data access for either value. Which
// functions a future report may call for each value is a real, governed
// rule, not a free choice: see docs/architecture/ADR/0004-reporting-data-access-strategy.md.
export const REPORT_DATA_SOURCES = deepFreeze({
  ERP: 'erp',
  BUSINESS_INTELLIGENCE: 'businessIntelligence'
});

export const REPORT_FILTER_KEYS = deepFreeze({
  DATE_RANGE: 'dateRange',
  STATUS: 'status',
  CATEGORY: 'category',
  SUPPLIER: 'supplier',
  CUSTOMER: 'customer',
  SEARCH: 'search',
  // Milestone 14B.2: a new filter key, added the way
  // reporting-platform-architecture.md §13 ("Add a new filter key") already
  // documents -- extend this map and shell/reportFilterBar.js's switch,
  // both inside this platform's own files, nothing else changes. The Sales
  // Register's own real need: "has this invoice been paid" is a distinct
  // question from STATUS (which this app's schema calls doc_type -- Sale /
  // Sale Return / Quotation), so it gets its own filter rather than
  // overloading one control with two unrelated dimensions.
  PAYMENT_STATUS: 'paymentStatus',
  // Milestone 14B.4A: same extension mechanism, second use. The Stock
  // Register's own real need -- filter stock_ledger rows down to one
  // item -- has no existing key: CATEGORY/SUPPLIER/CUSTOMER are all the
  // wrong noun for "which item", and mislabeling one of those controls to
  // mean "item" would be worse than naming this plainly.
  ITEM: 'item'
});

export const REPORT_EXPORT_FORMATS = deepFreeze({
  CSV: 'csv',
  PRINT: 'print'
});

/**
 * @typedef {object} ReportDefinition
 * @property {string} id unique, no ad hoc duplicates (enforced at registry register())
 * @property {string} title human-readable, shown on the hub and the report's own header
 * @property {string} description
 * @property {string} category one of REPORT_CATEGORIES -- open string, not enum-enforced,
 *   since future report categories are expected to grow beyond what this milestone can name
 * @property {string} dataSource one of REPORT_DATA_SOURCES -- metadata only; 14A wires no
 *   actual data access for either value
 * @property {string[]} filters zero or more REPORT_FILTER_KEYS this report declares support for
 * @property {string[]} exportFormats zero or more REPORT_EXPORT_FORMATS this report supports
 * @property {string|null} requiredCapability optional, reserved, unenforced (see header comment)
 * @property {string|null} href where this report's own screen lives (a future report's `.html` file);
 *   null for a definition that has no live screen yet
 */

/**
 * @param {object} fields
 * @returns {ReportDefinition}
 */
export function createReportDefinition ({
  id, title, description, category, dataSource,
  filters = [], exportFormats = [], requiredCapability = null, href = null
}) {
  assertValidReportFields({ id, title, description, category, dataSource, filters, exportFormats, requiredCapability, href });

  return deepFreeze({
    id,
    title,
    description,
    category,
    dataSource,
    filters: [...filters],
    exportFormats: [...exportFormats],
    requiredCapability: requiredCapability || null,
    href: href || null
  });
}

function assertValidReportFields ({ id, title, description, category, dataSource, filters, exportFormats, requiredCapability, href }) {
  if (!id || typeof id !== 'string') throw new TypeError('createReportDefinition: id is required');
  if (!title || typeof title !== 'string') throw new TypeError('createReportDefinition: title is required');
  if (!description || typeof description !== 'string') throw new TypeError('createReportDefinition: description is required');
  if (!category || typeof category !== 'string') throw new TypeError('createReportDefinition: category is required');
  if (!dataSource || typeof dataSource !== 'string') throw new TypeError('createReportDefinition: dataSource is required');
  if (!Array.isArray(filters)) throw new TypeError('createReportDefinition: filters must be an array');
  if (filters.some((f) => typeof f !== 'string')) throw new TypeError('createReportDefinition: every filter must be a string key');
  if (!Array.isArray(exportFormats)) throw new TypeError('createReportDefinition: exportFormats must be an array');
  if (exportFormats.some((f) => typeof f !== 'string')) throw new TypeError('createReportDefinition: every exportFormat must be a string key');
  if (requiredCapability !== null && requiredCapability !== undefined && (typeof requiredCapability !== 'string' || !requiredCapability)) {
    throw new TypeError('createReportDefinition: requiredCapability must be a non-empty string when provided');
  }
  if (href !== null && href !== undefined && typeof href !== 'string') {
    throw new TypeError('createReportDefinition: href must be a string when provided');
  }
}

const REQUIRED_FIELDS = ['id', 'title', 'description', 'category', 'dataSource', 'filters', 'exportFormats', 'requiredCapability', 'href'];

/**
 * Structural contract check.
 * @param {ReportDefinition} definition
 */
export function assertValidReportDefinition (definition) {
  if (!definition || typeof definition !== 'object') throw new TypeError('assertValidReportDefinition: definition must be an object');
  for (const key of REQUIRED_FIELDS) {
    if (!(key in definition)) throw new TypeError(`assertValidReportDefinition: missing "${key}"`);
  }
  return true;
}
