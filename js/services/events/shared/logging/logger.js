// shared/logging/logger.js
// Same sink-injection logging abstraction as
// dataExchange/shared/logging/logger.js -- the event bus never calls
// console directly; the sink is injected (default: console) so a subscriber
// error can be routed anywhere (memory for tests, in future a remote sink)
// without touching bus.js itself.

import { createConsoleSink } from './consoleSink.js';

export function createLogger ({ name = 'events', sink = createConsoleSink() } = {}) {
  const write = (level, message, meta) => sink.write(level, name, message, meta);
  return {
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
    debug: (message, meta) => write('debug', message, meta)
  };
}
