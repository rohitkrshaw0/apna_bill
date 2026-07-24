// json/import/jsonParserV1.js
// Implements 9A's parsers/contract.js IDataParser for the canonical JSON
// interchange format -- validate()-before-parse() split, mirroring
// xml/tallyXmlParser.js's own convention exactly.
//
// Unlike XML, JSON's entities ARE already DTO-shaped (self-describing via
// __dtoType, since jsonFormatterV1.js serializes dto/* objects directly) --
// so parse() returns genuine DTOs straight away, one honest simplification
// JSON's typed nature affords over Tally XML's raw-tag-record intermediate
// step (see milestone-10-json-design.md section 8).
//
// NEVER reconstructs a DTO through its createXDTO() factory -- deepFreeze()s
// the parsed plain object directly instead, so a field the file legitimately
// omitted stays absent rather than silently receiving that factory's own
// default (docs/data-exchange-architecture.md section 14.4, "never infer or
// fabricate data").

import { deepFreeze } from '../../shared/freezeDeep.js';
import { createValidationResult } from '../../validators/validationResult.js';
import { createDataExchangeError } from '../../shared/errors/dataExchangeError.js';
import { ERROR_CATEGORY, ERROR_CODES } from '../../shared/errors/index.js';
import { SEVERITY } from '../../shared/severity.js';
import { ENTITY_TYPES, ENTITY_PLURAL_KEYS } from '../shared/entityManifest.js';
import { canonicalStringify } from '../shared/canonicalJson.js';
import { computeChecksum } from '../shared/checksum.js';
import { parseVersion, compareVersions, isCompatible } from '../../shared/version/index.js';
import { getSchemaVersion, getMinSupportedSchemaVersion } from '../shared/jsonVersion.js';

export const MAX_JSON_BYTES = 200 * 1024 * 1024; // generous local-file cap, no compression assumed

function err (message, extra = {}) {
  return createDataExchangeError({ message, code: ERROR_CODES.SCHEMA_MISMATCH, category: ERROR_CATEGORY.SCHEMA, severity: SEVERITY.CRITICAL, source: 'json/jsonParserV1', ...extra });
}
function warn (message, extra = {}) {
  return createDataExchangeError({ message, category: ERROR_CATEGORY.SCHEMA, severity: SEVERITY.WARNING, source: 'json/jsonParserV1', ...extra });
}

function normalizeSource (source) {
  if (typeof source === 'string') return { text: source, byteLength: new TextEncoder().encode(source).length };
  if (source instanceof ArrayBuffer) {
    const text = new TextDecoder('utf-8').decode(source);
    return { text, byteLength: source.byteLength };
  }
  if (source && typeof source === 'object') {
    // Already-parsed envelope object (e.g. passed in-memory by a caller/test).
    const text = JSON.stringify(source);
    return { text, byteLength: new TextEncoder().encode(text).length, preParsed: source };
  }
  throw new Error('jsonParserV1: source must be a string, ArrayBuffer, or a plain envelope object');
}

function parseEnvelope (normalized) {
  if (normalized.preParsed) return normalized.preParsed;
  return JSON.parse(normalized.text);
}

function checkCompatibility (schemaVersionText) {
  const errors = [];
  const warnings = [];
  const supported = getSchemaVersion();
  const minSupported = getMinSupportedSchemaVersion();

  if (!schemaVersionText || typeof schemaVersionText !== 'string') {
    errors.push(err('Envelope has no readable "schemaVersion"'));
    return { errors, warnings };
  }
  const version = parseVersion(schemaVersionText);

  if (version.major !== supported.major) {
    errors.push(err(`Envelope schemaVersion major ${version.major} is not supported -- this import engine understands major version ${supported.major} only`));
  } else if (!isCompatible(version, minSupported)) {
    errors.push(err('Envelope schemaVersion is older than the minimum this import engine supports'));
  } else if (compareVersions(version, supported) > 0) {
    warnings.push(warn('Envelope was produced by a newer minor/patch schemaVersion than this import engine was tested against'));
  }

  return { errors, warnings };
}

function checkChecksums (envelope) {
  const errors = [];
  const entities = envelope.entities || {};
  const declared = envelope.manifest?.checksums || {};

  for (const type of ENTITY_TYPES) {
    const list = entities[ENTITY_PLURAL_KEYS[type]] || [];
    const actual = computeChecksum(canonicalStringify(list));
    if (declared[type] && declared[type] !== actual) {
      errors.push(err(`Checksum mismatch for entity "${type}": manifest declares ${declared[type]}, actual content hashes to ${actual}`, { entity: type }));
    }
  }

  if (declared.envelope) {
    const actualEnvelope = computeChecksum(canonicalStringify(entities));
    if (declared.envelope !== actualEnvelope) {
      errors.push(err(`Envelope checksum mismatch: manifest declares ${declared.envelope}, actual content hashes to ${actualEnvelope}`));
    }
  }

  return errors;
}

export function createJsonParserV1 () {
  let warnings = [];
  let errors = [];
  let metadata = {};

  function reset () { warnings = []; errors = []; metadata = {}; }

  function validate (source) {
    reset();
    let normalized;
    try {
      normalized = normalizeSource(source);
    } catch (e) {
      errors.push(err(e.message));
      return createValidationResult({ errors });
    }

    if (normalized.byteLength > MAX_JSON_BYTES) {
      errors.push(err(`File is ${normalized.byteLength} bytes, exceeding the ${MAX_JSON_BYTES}-byte cap`, { suggestion: 'Split the export into smaller files' }));
      return createValidationResult({ errors });
    }

    let envelope;
    try {
      envelope = parseEnvelope(normalized);
    } catch (e) {
      errors.push(err(`Malformed JSON: ${e.message}`));
      return createValidationResult({ errors });
    }

    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      errors.push(err('Envelope must be a JSON object'));
      return createValidationResult({ errors });
    }
    if (!envelope.manifest || typeof envelope.manifest !== 'object') {
      errors.push(err('Envelope is missing required "manifest" object'));
      return createValidationResult({ errors });
    }
    if (!envelope.entities || typeof envelope.entities !== 'object') {
      errors.push(err('Envelope is missing required "entities" object'));
      return createValidationResult({ errors });
    }

    const compat = checkCompatibility(envelope.schemaVersion);
    errors.push(...compat.errors);
    warnings.push(...compat.warnings);
    if (compat.errors.length) return createValidationResult({ errors, warnings });

    errors.push(...checkChecksums(envelope));

    return createValidationResult({ errors, warnings });
  }

  function parse (source) {
    reset();
    const normalized = normalizeSource(source);
    const envelope = parseEnvelope(normalized);

    const entities = envelope.entities || {};
    const dtos = [];
    const countsByType = {};
    for (const type of ENTITY_TYPES) {
      const list = entities[ENTITY_PLURAL_KEYS[type]] || [];
      countsByType[type] = list.length;
      for (const raw of list) dtos.push(deepFreeze({ ...raw }));
    }

    metadata = {
      sourceFormat: 'json',
      schemaVersion: envelope.schemaVersion || null,
      generatedAt: envelope.metadata?.exportTimestamp || null,
      companyId: envelope.metadata?.companyId || null,
      generator: envelope.generator || null,
      company: envelope.company || null,
      recordCount: dtos.length,
      countsByType,
      envelopeWarnings: envelope.warnings || []
    };

    return dtos;
  }

  return {
    validate,
    parse,
    getMetadata: () => metadata,
    getWarnings: () => warnings,
    getErrors: () => errors
  };
}
