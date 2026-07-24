// json/export/jsonFormatterV1.js
// Implements 9A's formatters/contract.js IFormatter for the canonical JSON
// interchange format. This is the "format-aware/business-aware" layer (see
// milestone-10-json-design.md section 6) -- it knows the envelope's shape
// (schemaVersion/manifest/entities/...) but nothing about HOW to serialize
// deterministically (canonicalJson.js's job) or HOW to checksum
// (checksum.js's job). Mirrors tallyXmlFormatterV1.js's role for XML.

import { ENTITY_TYPES, ENTITY_PLURAL_KEYS, DEPENDENCY_EDGES } from '../shared/entityManifest.js';
import { canonicalize, canonicalStringify } from '../shared/canonicalJson.js';
import { computeChecksum } from '../shared/checksum.js';
import { getSchemaVersion, getApplicationVersion, getMinSupportedSchemaVersion, formatVersion } from '../shared/jsonVersion.js';

export function getFormatVersion () { return getSchemaVersion(); }

/**
 * @param {object} exportModel { companyDto, byType: {item,customer,supplier,sale -> DTO[]}, meta: {companyId, exportedBy, scope, requestedEntities}, warnings }
 * @returns {{envelope: object, entities: string[]}}
 */
export function buildEnvelope (exportModel) {
  const byType = exportModel.byType || {};
  const meta = exportModel.meta || {};
  const presentEntities = ENTITY_TYPES.filter(t => (byType[t] || []).length > 0 || (meta.requestedEntities || []).includes(t));

  const entities = {};
  const recordCounts = {};
  const checksums = {};
  for (const type of ENTITY_TYPES) {
    const list = byType[type] || [];
    entities[ENTITY_PLURAL_KEYS[type]] = list;
    recordCounts[type] = list.length;
    checksums[type] = computeChecksum(canonicalStringify(list));
  }
  checksums.envelope = computeChecksum(canonicalStringify(entities));

  const envelope = {
    schemaVersion: formatVersion(getSchemaVersion()),
    generator: {
      application: 'ApnaBill',
      applicationVersion: formatVersion(getApplicationVersion()),
      engine: 'migration-engine',
      engineVersion: '1.0.0'
    },
    metadata: {
      exportTimestamp: meta.exportTimestamp || new Date().toISOString(),
      exportedBy: meta.exportedBy ?? null,
      companyId: meta.companyId ?? null,
      scope: meta.scope || 'company',
      requestedEntities: meta.scope === 'entities' ? (meta.requestedEntities || []) : null
    },
    compatibility: {
      minSupportedSchemaVersion: formatVersion(getMinSupportedSchemaVersion()),
      maxKnownSchemaVersion: formatVersion(getSchemaVersion())
    },
    company: exportModel.companyDto || null,
    manifest: {
      entities: presentEntities,
      recordCounts,
      checksums
    },
    entities,
    relationships: DEPENDENCY_EDGES.map(([node, dependsOn]) => [node, dependsOn]),
    warnings: exportModel.warnings || [],
    featureFlags: {},
    futureReserved: {}
  };

  return { envelope, entities: presentEntities };
}

export function createJsonFormatterV1 () {
  /**
   * @param {object} exportModel see buildEnvelope()
   * @param {object} [opts] { pretty }
   * @returns {{json: string, bytes: Uint8Array, envelope: object}}
   */
  function format (exportModel, opts = {}) {
    const { envelope } = buildEnvelope(exportModel);
    const json = canonicalStringify(envelope, { pretty: opts.pretty !== false });
    const bytes = new TextEncoder().encode(json);
    return { json, bytes, envelope: canonicalize(envelope) };
  }

  return { getFormatVersion, format };
}
