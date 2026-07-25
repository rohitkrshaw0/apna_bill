// extensions/sampleExtension.js
// The one demonstration extension (Milestone 11F section
// "Demonstration"): validates the framework end to end. Performs NO
// business functionality -- it exists solely to prove register ->
// initialize -> subscribe to a real Domain Event -> write Diagnostics ->
// query Audit -> unregister cleanly all work through the framework's own
// public surface, never by reaching into an ERP module directly (there
// is no import here beyond EVENT_TYPES and the contract builder).
//
// This file is exercised only by extensionFramework.test.html -- it is
// never registered anywhere in the real application.

import { EVENT_TYPES } from '../../events/index.js';
import { createExtensionDefinition } from '../contracts/extensionContract.js';

export function createSampleExtension () {
  let unsubscribe = null;

  return createExtensionDefinition({
    id: 'sample-extension',
    name: 'Sample Extension',
    version: '1.0.0',
    description: 'Minimal demonstration extension validating the Plugin & Extension Framework end to end. Performs no business functionality.',
    author: 'ApnaBill Platform Team',
    capabilities: ['sample-capability'],
    dependencies: [],
    hooks: {
      onInitialize (context) {
        context.diagnostics.logger.info('Sample extension initialized');
      },

      onStart (context) {
        unsubscribe = context.events.subscribe(EVENT_TYPES.ITEM_CREATED, (event) => {
          context.diagnostics.logger.info(`Sample extension observed ${event.type}`, {
            meta: { eventId: event.id, aggregateId: event.aggregateId }
          });
          // "query Audit" -- read-only, via the Extension Context's own
          // Audit Query API, never the Audit Platform's write path.
          const relatedRecords = context.audit.query.byEventType(EVENT_TYPES.ITEM_CREATED);
          context.diagnostics.logger.info(`Sample extension queried audit: ${relatedRecords.length} ItemCreated record(s) found`, {
            meta: { count: relatedRecords.length }
          });
        });
        context.diagnostics.logger.info('Sample extension started');
      },

      onStop (context) {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        context.diagnostics.logger.info('Sample extension stopped');
      },

      onDispose (context) {
        context.diagnostics.logger.info('Sample extension disposed');
      }
    }
  });
}
