// dto/metadataDTO.js
// Format-independent Metadata shape -- describes a batch of exchanged data
// (its source, format, generated-at time), not a business entity itself.

import { createDTO } from './baseDTO.js';

export function createMetadataDTO ({ sourceFormat = null, generatedAt = null, recordCount = 0, extra = {} } = {}) {
  return createDTO('metadata', { sourceFormat, generatedAt, recordCount, extra });
}
