// providers/index.js
// Convenience barrel -- registers every posting provider shipped so far:
// the three automatic ones from Milestone 15B (Sales/Purchase/
// Manufacturing) plus the Manual Journal provider from Milestone 15C.
// Each registerX() is idempotent individually (see each provider file);
// this just calls all four, the same "one function calls every
// registerXReport()" shape reports.html already uses for the Reporting
// Platform's own registrations.
//
// sales.js/purchases.js/manufacturing.js/journal.html each import and
// call their own single registerXPostingProvider() at module load rather
// than this barrel, so a screen that only ever creates purchases never
// pulls in the sales/manufacturing/journal provider modules it doesn't
// need. This file exists for callers that do want all of them at once
// (the test suite).

import { registerSalesPostingProvider } from './salesPostingProvider.js';
import { registerPurchasePostingProvider } from './purchasePostingProvider.js';
import { registerManufacturingPostingProvider } from './manufacturingPostingProvider.js';
import { registerManualJournalPostingProvider } from './manualJournalPostingProvider.js';

export { registerSalesPostingProvider, registerPurchasePostingProvider, registerManufacturingPostingProvider, registerManualJournalPostingProvider };

export function registerAllPostingProviders () {
  registerSalesPostingProvider();
  registerPurchasePostingProvider();
  registerManufacturingPostingProvider();
  registerManualJournalPostingProvider();
}
