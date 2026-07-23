// dto/settingsDTO.js
// Format-independent Settings shape -- a generic key/value bag, since
// settings vary by module and this framework doesn't know which ones.

import { createDTO } from './baseDTO.js';

export function createSettingsDTO ({ scope = 'company', values = {} } = {}) {
  return createDTO('settings', { scope, values });
}
