// providers/index.js
// Convenience barrel -- registers every posting provider shipped so far:
// the three automatic ones from Milestone 15B (Sales/Purchase/
// Manufacturing), the Manual Journal provider from Milestone 15C, and the
// Receipt/Payment providers from Milestone 15I. Each registerX() is
// idempotent individually (see each provider file); this just calls all
// six, the same "one function calls every registerXReport()" shape
// reports.html already uses for the Reporting Platform's own
// registrations.
//
// sales.js/purchases.js/manufacturing.js/journal.html/payments.html each
// import and call their own single registerXPostingProvider() at module
// load rather than this barrel, so a screen that only ever creates
// purchases never pulls in the sales/manufacturing/journal/payments
// provider modules it doesn't need. This file exists for callers that do
// want all of them at once (the test suite).

import { registerSalesPostingProvider } from './salesPostingProvider.js';
import { registerPurchasePostingProvider } from './purchasePostingProvider.js';
import { registerManufacturingPostingProvider } from './manufacturingPostingProvider.js';
import { registerManualJournalPostingProvider } from './manualJournalPostingProvider.js';
import { registerReceiptPostingProvider } from './receiptPostingProvider.js';
import { registerPaymentPostingProvider } from './paymentPostingProvider.js';

export {
  registerSalesPostingProvider, registerPurchasePostingProvider, registerManufacturingPostingProvider,
  registerManualJournalPostingProvider, registerReceiptPostingProvider, registerPaymentPostingProvider
};

export function registerAllPostingProviders () {
  registerSalesPostingProvider();
  registerPurchasePostingProvider();
  registerManufacturingPostingProvider();
  registerManualJournalPostingProvider();
  registerReceiptPostingProvider();
  registerPaymentPostingProvider();
}
