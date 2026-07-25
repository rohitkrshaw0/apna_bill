// services/extensions/index.js
// Public barrel for the Plugin & Extension Framework (Milestone 11F).
// Depends only on events/, diagnostics/, audit/, and jobs/ (their public
// barrels) -- nothing under dataExchange/ or any business file is
// imported anywhere in this platform, confirmed by grep. This is also
// the FINAL infrastructure platform per the roadmap
// (docs/architecture/platform-roadmap.md) -- no platform under
// js/services/ imports FROM extensions/, and extensions/ imports from
// every other platform, never the reverse:
//
//   ERP -> Infrastructure -> { Event Bus, Diagnostics, Job Engine, Audit, Extension Framework }
//
// Importing this module has NO side effects -- `extensionRuntime` below
// is constructed with an empty registry; nothing is registered,
// initialized, or started until a caller explicitly does so. This
// milestone's brief gave no instruction to wire live startup (unlike
// 11D's Job Engine), and registers no real extension anywhere in the
// application -- only the one demonstration extension
// (extensions/sampleExtension.js) exists, exercised solely by
// extensionFramework.test.html.

import { createExtensionLifecycleManager } from './lifecycle/extensionLifecycleManager.js';

export { createExtensionDefinition, assertValidExtensionDefinition } from './contracts/extensionContract.js';
export { createExtensionRegistry } from './registry/extensionRegistry.js';
export { createCapabilityRegistry } from './registry/capabilityRegistry.js';
export {
  validateExtension, isDuplicateId, findMissingDependencies, findIncompatibleVersions, detectCircularDependency
} from './validation/dependencyValidator.js';
export { createExtensionContext } from './context/extensionContext.js';
export { createExtensionLifecycleManager, LIFECYCLE_STATE } from './lifecycle/extensionLifecycleManager.js';
export { parseVersion, compareVersions, satisfiesMinVersion } from './shared/semver.js';

/** The application-wide Extension runtime. Empty registry, nothing started, until a caller explicitly registers an extension. */
export const extensionRuntime = createExtensionLifecycleManager();
