// shared/version/compatibility.js
// Version comparison, used by the future Restore Framework to check a
// backup's version against the app's minimum-compatible version.

export function compareVersions (a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function isCompatible (version, minCompatible) {
  return compareVersions(version, minCompatible) >= 0;
}
