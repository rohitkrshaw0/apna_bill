// shared/logging/memorySink.js
// Collects log entries into memory instead of printing them -- useful for
// tests, and for a future Diagnostics/Audit subscriber (11C/11D) that wants
// to inspect what the bus logged without capturing stdout.

export function createMemorySink () {
  const entries = [];
  return {
    write: (level, name, message, meta) => { entries.push({ level, name, message, meta, at: Date.now() }); },
    getEntries: () => entries.slice()
  };
}
