// registry/jobRegistry.js
// Central registry of every background job (Milestone 11D section "Job
// Registry"). Unlike events/registry/eventTypes.js (a static data table --
// event types carry no executable code), a job carries a real handler
// function, so this registry is necessarily a small runtime construct
// (`createJobRegistry()`, a factory, matching every other stateful service
// in this codebase) rather than a plain constant object -- the SAME
// "avoid string literals" guarantee still holds: register() rejects any
// definition whose `id` is not one of JOB_IDS, and rejects a second
// registration of an id already registered.

import { JOB_IDS } from './jobIds.js';
import { assertValidJobDefinition } from '../contracts/jobContract.js';

function isKnownJobId (id) {
  return Object.values(JOB_IDS).includes(id);
}

export function createJobRegistry () {
  /** @type {Map<string, import('../contracts/jobContract.js').JobDefinition>} */
  const definitions = new Map();

  /** @param {import('../contracts/jobContract.js').JobDefinition} definition */
  function register (definition) {
    assertValidJobDefinition(definition);
    if (!isKnownJobId(definition.id)) {
      throw new TypeError(`jobRegistry: "${definition.id}" is not a registered job id -- add it to jobs/registry/jobIds.js first`);
    }
    if (definitions.has(definition.id)) {
      throw new TypeError(`jobRegistry: a job is already registered for id "${definition.id}"`);
    }
    definitions.set(definition.id, definition);
    return definition;
  }

  /** @param {string} id @returns {import('../contracts/jobContract.js').JobDefinition|null} */
  function get (id) {
    return definitions.get(id) || null;
  }

  /** @returns {import('../contracts/jobContract.js').JobDefinition[]} */
  function list () {
    return [...definitions.values()];
  }

  /** Every registered job that declares `eventType` among its triggerEvents. @param {string} eventType */
  function getByTriggerEvent (eventType) {
    return list().filter((definition) => definition.triggerEvents.includes(eventType));
  }

  function clear () {
    definitions.clear();
  }

  return { register, get, list, getByTriggerEvent, clear };
}
