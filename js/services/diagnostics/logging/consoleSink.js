// logging/consoleSink.js
// The default sink -- routes a structured entry to the matching console
// method. Unlike events/shared/logging's console sink (a 4-argument
// level/name/message/meta tuple), this sink receives one whole structured
// LogEntry object (see structuredLogger.js), because "every log entry must
// be structured" is this milestone's own explicit requirement, not just an
// internal error-reporting convenience the way events/'s tiny logger is.

export function createConsoleSink () {
  return {
    write (entry) {
      const line = `[${entry.name}] ${entry.message}`;
      const rest = { timestamp: entry.timestamp, trace: entry.trace, meta: entry.meta };
      if (entry.level === 'error') console.error(line, rest);
      else if (entry.level === 'warn') console.warn(line, rest);
      else if (entry.level === 'debug') console.debug(line, rest);
      else console.log(line, rest);
    }
  };
}
