// json/shared/jsonVersion.js
// Two distinct version concepts, both built on shared/version/'s existing
// createVersion()/formatVersion() machinery (never reimplemented):
//   getSchemaVersion()      -- the canonical JSON schema's OWN version. A
//                               future breaking change to the envelope shape
//                               bumps the major; an additive field bumps the
//                               minor. Import-side compatibility checks
//                               against this (see jsonParserV1.js).
//   getApplicationVersion() -- no app-wide version constant exists anywhere
//                               in this codebase today (no package.json, no
//                               VERSION file, no exported constant under
//                               js/ -- confirmed before writing this file).
//                               Per this platform's "never infer or
//                               fabricate data" principle, this does not
//                               invent a real app version number; it
//                               declares a new, minimal marker, exactly the
//                               same pattern apnabillArchiveFormatterV1.js's
//                               getFormatVersion() already established for
//                               format-level versioning out of nothing. A
//                               future maintainer wiring up a real app
//                               version only needs to change this function.

import { createVersion, formatVersion } from '../../shared/version/index.js';

export function getSchemaVersion () {
  return createVersion({ major: 1, minor: 0, patch: 0 });
}

export function getApplicationVersion () {
  return createVersion({ major: 1, minor: 0, patch: 0, label: 'apnabill-app' });
}

export function getMinSupportedSchemaVersion () {
  return createVersion({ major: 1, minor: 0, patch: 0 });
}

export { formatVersion };
