// shared/logging/consoleSink.js
// One pluggable sink implementation -- the logger itself never depends on
// console directly (see logger.js); this is just one option among several
// a caller can inject (see memorySink.js for the other).

export function createConsoleSink () {
  return {
    write: (level, name, message, meta) => {
      const line = `[${name}] ${message}`;
      if (level === 'error') console.error(line, meta);
      else if (level === 'warn') console.warn(line, meta);
      else console.log(line, meta);
    }
  };
}
