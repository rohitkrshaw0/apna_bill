// services/dataExchange/json/index.js
// Public barrel for the canonical JSON interchange format engine (Milestone
// 10). A future settings/integration screen imports from here rather than
// reaching into individual subfolders, same convention as xml/index.js and
// apnabill/index.js.

export { ENTITY_TYPES, ENTITY_PLURAL_KEYS, DEPENDENCY_EDGES, pluralKeyFor } from './shared/entityManifest.js';
export { canonicalize, canonicalStringify } from './shared/canonicalJson.js';
export { computeChecksum } from './shared/checksum.js';
export { getSchemaVersion, getApplicationVersion, getMinSupportedSchemaVersion } from './shared/jsonVersion.js';

export {
  requiredFieldsRule, dateFormatRule, gstRateCrossCheckRule, referencedEntitiesRule, duplicateNameWithinBatchRule
} from './rules/jsonBusinessRules.js';

// ---- Export -------------------------------------------------------------
export { getFormatVersion, buildEnvelope, createJsonFormatterV1 } from './export/jsonFormatterV1.js';
export { buildJsonExportPlan, createJsonExporter, runJsonExport } from './export/jsonExporter.js';
export { downloadJsonFile } from './export/download.js';

// ---- Import ---------------------------------------------------------------
export { createJsonParserV1, MAX_JSON_BYTES } from './import/jsonParserV1.js';
export { buildJsonImportPlan, createJsonImporter } from './import/jsonImporter.js';
