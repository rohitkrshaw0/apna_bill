// shared/semver.js
// A minimal, self-contained major.minor.patch comparator -- just enough
// for "version tracking" and "version compatibility" (Milestone 11F
// section "Dependency Validation"), not a general-purpose semver
// implementation (no pre-release/build-metadata parsing, no ranges
// beyond a single minimum version). Deliberately not an external
// dependency -- the brief's own "do not over-engineer" and this
// codebase's consistent preference for small, owned primitives over
// pulling in a library for one comparison function.

/** @param {string} version e.g. "1.2.3" -- missing/non-numeric parts default to 0 */
export function parseVersion (version) {
  const parts = String(version).split('.').map((n) => parseInt(n, 10));
  return {
    major: Number.isFinite(parts[0]) ? parts[0] : 0,
    minor: Number.isFinite(parts[1]) ? parts[1] : 0,
    patch: Number.isFinite(parts[2]) ? parts[2] : 0
  };
}

/** @returns {number} negative if a < b, positive if a > b, 0 if equal */
export function compareVersions (a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

/** @param {string} version @param {string} [minVersion] @returns {boolean} true if minVersion is absent or version >= minVersion */
export function satisfiesMinVersion (version, minVersion) {
  if (!minVersion) return true;
  return compareVersions(version, minVersion) >= 0;
}
