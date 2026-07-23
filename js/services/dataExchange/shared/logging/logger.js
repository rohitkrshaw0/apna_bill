// shared/logging/logger.js
// A logging abstraction so future importers/exporters never call
// console.log directly -- the sink is injected (default: console), and any
// other sink (memory, in future a remote one) can be swapped in without
// touching call sites.

import { createConsoleSink } from './consoleSink.js';

export function createLogger ({ name = 'dataExchange', sink = createConsoleSink() } = {}) {
  const write = (level, message, meta) => sink.write(level, name, message, meta);
  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
    debug: (message, meta) => write('debug', message, meta)
  };
}
