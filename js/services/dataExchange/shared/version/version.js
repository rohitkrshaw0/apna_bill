// shared/version/version.js
// One generic version shape, reused for every kind of version this
// framework needs to track (app version, schema version, migration
// version, backup version) -- they're all "major.minor.patch plus a label",
// so one factory covers all four rather than four near-identical wrappers.

import { deepFreeze } from '../freezeDeep.js';

export function createVersion ({ major = 0, minor = 0, patch = 0, label = null } = {}) {
  return deepFreeze({ major, minor, patch, label });
}

export function formatVersion (version) {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  return version.label ? `${base}-${version.label}` : base;
}

export function parseVersion (text) {
  const [core, label = null] = String(text).split('-');
  const [major = 0, minor = 0, patch = 0] = core.split('.').map(Number);
  return createVersion({ major, minor, patch, label });
}
