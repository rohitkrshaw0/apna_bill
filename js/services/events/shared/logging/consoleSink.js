// shared/logging/consoleSink.js
// One pluggable sink implementation -- the logger itself never depends on
// console directly (see logger.js); this is just one option a caller can
// inject (see memorySink.js for the other). Identical shape to
// dataExchange/shared/logging/consoleSink.js -- see freezeDeep.js for why
// events/ owns its own copy instead of importing across platforms.

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
