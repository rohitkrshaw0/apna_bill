// registry/reportRegistry.js
// Central registration of reports (Milestone 14A "Report Registry" /
// "Report Registration" / "Report Discovery"). Modeled on
// extensions/registry/extensionRegistry.js's shape -- a dynamic registry
// with a duplicate-id check at register() time -- rather than the Job
// Engine's fixed JOB_IDS enum, because reports are expected to be
// registered incrementally by future milestones (14B, 14C, ...), not
// defined as a small, fixed set known upfront the way the 3 background
// jobs are.
//
// This registry IS the Reporting Platform's own extension point: any
// future module registers a report by calling register(definition) on
// the shared instance this platform's index.js exports -- no change to
// this file, or to the frozen Extension Framework, is needed to add a
// new report. See docs/architecture/reporting-platform-architecture.md
// §"Extension points".

import { assertValidReportDefinition } from '../contracts/reportContract.js';

export function createReportRegistry () {
  /** @type {Map<string, import('../contracts/reportContract.js').ReportDefinition>} */
  const definitions = new Map();

  /**
   * @param {import('../contracts/reportContract.js').ReportDefinition} definition
   * @throws {TypeError} if the definition fails its own contract check, or its id is already registered
   */
  function register (definition) {
    assertValidReportDefinition(definition);
    if (definitions.has(definition.id)) {
      throw new TypeError(`reportRegistry.register: "${definition.id}" is already registered`);
    }
    definitions.set(definition.id, definition);
    return definition;
  }

  /** @param {string} id @returns {import('../contracts/reportContract.js').ReportDefinition|null} */
  function get (id) {
    return definitions.get(id) || null;
  }

  /** @returns {import('../contracts/reportContract.js').ReportDefinition[]} sorted by title, for a stable hub listing */
  function list () {
    return [...definitions.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  /** @param {string} id @returns {boolean} */
  function has (id) {
    return definitions.has(id);
  }

  /** @param {string} id @returns {boolean} true if a definition was actually removed */
  function unregister (id) {
    return definitions.delete(id);
  }

  function clear () {
    definitions.clear();
  }

  return { register, get, list, has, unregister, clear };
}
