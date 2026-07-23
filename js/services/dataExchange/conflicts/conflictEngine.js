// conflicts/conflictEngine.js
// Runs injected detectors against existing vs. incoming records and
// collects the conflicts they find. The engine itself knows nothing about
// any entity type -- detectors (registered by a future importer) do.
//
// A detector is `(existingRecords, incomingRecords) => Conflict[]`.

export function createConflictEngine ({ detectors = [] } = {}) {
  return {
    detect: (existingRecords, incomingRecords) =>
      detectors.flatMap(detector => detector(existingRecords, incomingRecords))
  };
}
