// shared/errors/errorCollector.js
// Aggregates structured errors/warnings/information without ever throwing --
// built to collect hundreds of entries (e.g. one per bad row in a large
// import file) and let the caller decide what to do with them.

import { SEVERITY } from '../severity.js';

export function createErrorCollector () {
  const entries = [];

  function add (error) { entries.push(error); return error; }
  function addMany (list) { for (const e of list) entries.push(e); }
  function byServerity (severity) { return entries.filter(e => e.severity === severity); }

  return {
    add,
    addMany,
    getErrors: () => byServerity(SEVERITY.ERROR).concat(byServerity(SEVERITY.CRITICAL)),
    getWarnings: () => byServerity(SEVERITY.WARNING),
    getInformation: () => byServerity(SEVERITY.INFO),
    hasErrors: () => entries.some(e => e.severity === SEVERITY.ERROR || e.severity === SEVERITY.CRITICAL),
    count: () => entries.length,
    toArray: () => entries.slice()
  };
}
