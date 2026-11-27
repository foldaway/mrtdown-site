import type { Station } from '@mrtdown/core';

/** Canonical branch identity and display metadata; contains no arrival predictions. */
export type StationArrivalBranch = {
  serviceId: string;
  lineId: string;
  serviceName: Station['name'];
  destinationStationId: string | null;
  destinationCode: string;
  destinationName: Station['name'] | null;
  platformLabels: string[];
  isLoop?: true;
  viaStationId?: string;
  viaStationName?: Station['name'];
};

export function isLoopPath(
  path: readonly { stationId: string }[],
  anchor: string,
) {
  return (
    path.length > 2 &&
    path[0].stationId === anchor &&
    path.at(-1)?.stationId === anchor
  );
}

/** A branch-wide via label is safe only when every boarding visit agrees. */
export function loopViaStationId(
  path: readonly { stationId: string }[],
  stationId: string,
) {
  const nextStations = new Set(
    path.flatMap((entry, index) =>
      entry.stationId === stationId && index < path.length - 1
        ? [path[index + 1].stationId]
        : [],
    ),
  );
  return nextStations.size === 1 ? [...nextStations][0] : undefined;
}
