// contracts/postingProviderContract.js
// The immutable shape of a posting provider (Milestone 15A "Posting
// Registry"). Registration only -- see the header of
// registry/postingProviderRegistry.js and voucherTypeContract.js for what
// distinguishes a posting provider from a voucher type.
//
// ---------------------------------------------------------------------
// buildJournalEntry IS CARRIED, VALIDATED, AND NEVER INVOKED IN 15A
// ---------------------------------------------------------------------
// The brief for this milestone is explicit: "Only registration. No
// posting logic." buildJournalEntry is declared here, type-checked when
// supplied, and called by nothing in this platform -- Milestone 15B is
// what invokes it, once a real posting pipeline exists.
//
// This is not scope creep; it follows a pattern this repository already
// uses three times for a declared-but-unwired capability: reporting's own
// requiredCapability (ADR-0003 decision 3), the Job Engine's unused
// CANCELLED lifecycle state, and Business Intelligence's unwired
// DashboardCardProvider capability. Omitting the field here would force a
// contract change in the very next milestone for a shape that is already
// known. The alternative -- adding sourceEvents here to pre-wire a future
// events/ coupling -- was rejected: that field would be inert with no
// present meaning, unlike buildJournalEntry, which has an exact, already-
// specified future caller (15B's posting pipeline).
//
// deepFreeze skips functions (see shared/freezeDeep.js), so freezing a
// PostingProviderDefinition never freezes buildJournalEntry itself.

import { deepFreeze } from '../shared/freezeDeep.js';

/**
 * @typedef {object} PostingProviderDefinition
 * @property {string} id unique, no ad hoc duplicates (enforced at registry register())
 * @property {string} name human-readable
 * @property {string} description
 * @property {number} version positive integer, matching jobs/contracts/jobContract.js's own convention
 * @property {string} sourceModule a POSTING_SOURCES value (journalContract.js) -- open string
 * @property {string[]} voucherTypes voucher type ids this provider can produce lines for.
 *   NOT resolved against voucherTypeRegistry here -- contracts never reach for state; the
 *   registry may optionally check it (see registry/postingProviderRegistry.js)
 * @property {Function|null} buildJournalEntry optional, validated, never invoked in 15A (see header)
 * @property {object} metadata
 */

/**
 * @param {object} fields
 * @returns {PostingProviderDefinition}
 */
export function createPostingProviderDefinition ({
  id, name, description, version = 1,
  sourceModule, voucherTypes = [], buildJournalEntry = null, metadata = {}
}) {
  assertValidPostingProviderFields({ id, name, description, version, sourceModule, voucherTypes, buildJournalEntry, metadata });

  return deepFreeze({
    id, name, description, version, sourceModule,
    voucherTypes: [...voucherTypes],
    buildJournalEntry: buildJournalEntry || null,
    metadata: { ...metadata }
  });
}

function assertValidPostingProviderFields ({ id, name, description, version, sourceModule, voucherTypes, buildJournalEntry, metadata }) {
  if (!id || typeof id !== 'string') throw new TypeError('createPostingProviderDefinition: id is required');
  if (!name || typeof name !== 'string') throw new TypeError('createPostingProviderDefinition: name is required');
  if (!description || typeof description !== 'string') throw new TypeError('createPostingProviderDefinition: description is required');
  if (!Number.isInteger(version) || version < 1) throw new TypeError('createPostingProviderDefinition: version must be a positive integer');
  if (!sourceModule || typeof sourceModule !== 'string') throw new TypeError('createPostingProviderDefinition: sourceModule is required');

  if (!Array.isArray(voucherTypes)) throw new TypeError('createPostingProviderDefinition: voucherTypes must be an array');
  if (voucherTypes.some((v) => typeof v !== 'string' || !v)) {
    throw new TypeError('createPostingProviderDefinition: every voucherTypes entry must be a non-empty string');
  }
  if (buildJournalEntry !== null && buildJournalEntry !== undefined && typeof buildJournalEntry !== 'function') {
    throw new TypeError('createPostingProviderDefinition: buildJournalEntry must be a function when provided');
  }
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new TypeError('createPostingProviderDefinition: metadata must be a plain object');
  }
}

const REQUIRED_FIELDS = ['id', 'name', 'description', 'version', 'sourceModule', 'voucherTypes', 'buildJournalEntry', 'metadata'];

/** @param {PostingProviderDefinition} definition */
export function assertValidPostingProviderDefinition (definition) {
  if (!definition || typeof definition !== 'object') throw new TypeError('assertValidPostingProviderDefinition: definition must be an object');
  for (const key of REQUIRED_FIELDS) {
    if (!(key in definition)) throw new TypeError(`assertValidPostingProviderDefinition: missing "${key}"`);
  }
  return true;
}
