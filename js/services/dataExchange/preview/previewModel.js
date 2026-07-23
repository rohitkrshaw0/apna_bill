// preview/previewModel.js
// Aggregates a list of PreviewItems -- reusable by every future importer's
// "review before import" screen, regardless of source format.

import { PREVIEW_STATUS } from './previewStatus.js';

export function createPreviewModel (items = []) {
  return {
    items,
    counts: () => Object.fromEntries(
      Object.values(PREVIEW_STATUS).map(status => [status, items.filter(i => i.status === status).length])
    ),
    filterByStatus: (status) => items.filter(i => i.status === status),
    summary: () => `${items.length} record(s) previewed`
  };
}
