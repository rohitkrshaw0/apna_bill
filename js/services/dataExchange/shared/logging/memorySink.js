// shared/logging/memorySink.js
// Collects log entries into memory instead of printing them -- useful for
// tests, and for feeding a future History Model without coupling logging to
// any particular persistence.

export function createMemorySink () {
  const entries = [];
  return {
    write: (level, name, message, meta) => { entries.push({ level, name, message, meta, at: Date.now() }); },
    getEntries: () => entries.slice()
  };
}
