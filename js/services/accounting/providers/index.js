// providers/index.js
// Convenience barrel (Milestone 15B) -- registers all three automatic
// posting providers this milestone ships. Each registerX() is idempotent
// individually (see each provider file); this just calls all three, the
// same "one function calls every registerXReport()" shape reports.html
// already uses for the Reporting Platform's own registrations.
//
// sales.js/purchases.js/manufacturing.js each import and call their own
// single registerXPostingProvider() at module load rather than this
// barrel, so a screen that only ever creates purchases never pulls in
// the sales/manufacturing provider modules it doesn't need. This file
// exists for callers that do want all three at once (the test suite).

import { registerSalesPostingProvider } from './salesPostingProvider.js';
import { registerPurchasePostingProvider } from './purchasePostingProvider.js';
import { registerManufacturingPostingProvider } from './manufacturingPostingProvider.js';

export { registerSalesPostingProvider, registerPurchasePostingProvider, registerManufacturingPostingProvider };

export function registerAllPostingProviders () {
  registerSalesPostingProvider();
  registerPurchasePostingProvider();
  registerManufacturingPostingProvider();
}
