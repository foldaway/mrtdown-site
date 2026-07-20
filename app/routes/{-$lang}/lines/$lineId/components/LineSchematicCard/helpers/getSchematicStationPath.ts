type BranchPath = {
  stationIds: readonly string[];
  entries: readonly { stationId: string; pathIndex: number }[];
};

export type SchematicStation = {
  stationId: string;
  key: string;
};

/**
 * Preserves repeated stations in a service path so a return leg is drawn.
 * `stationIds` is intentionally de-duplicated for data consumers that only
 * need a service's station set; schematics need the ordered path instead.
 */
export function getSchematicStationPath(branch: BranchPath) {
  return branch.entries.length > 0
    ? branch.entries.map((entry) => ({
        stationId: entry.stationId,
        key: `path-entry-${entry.pathIndex}`,
      }))
    : branch.stationIds.map((stationId) => ({
        stationId,
        key: `station-${stationId}`,
      }));
}
