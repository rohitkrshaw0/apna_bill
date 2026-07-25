// logging/logLevels.js
// The four levels the brief requires, plus their filter priority (higher
// number = more severe). minLevel filtering in structuredLogger.js is what
// makes this platform "environment-aware": a caller sets a lower minLevel
// (e.g. DEBUG) in development and a higher one (e.g. WARN) in production,
// without any change to call sites.

import { deepFreeze } from '../shared/freezeDeep.js';

export const LOG_LEVELS = deepFreeze({
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
});

export const LOG_LEVEL_PRIORITY = deepFreeze({
  [LOG_LEVELS.DEBUG]: 10,
  [LOG_LEVELS.INFO]: 20,
  [LOG_LEVELS.WARN]: 30,
  [LOG_LEVELS.ERROR]: 40
});
