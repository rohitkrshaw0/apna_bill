// logging/memorySink.js
// Collects structured entries into memory instead of printing them --
// used by tests, and available to any future tool (11D Audit, a future
// Diagnostics Dashboard) that wants to read back recent log entries
// without depending on a real console.

export function createMemorySink ({ maxEntries = 1000 } = {}) {
  const entries = [];
  return {
    write (entry) {
      entries.push(entry);
      if (entries.length > maxEntries) entries.shift();
    },
    getEntries: () => entries.slice()
  };
}
