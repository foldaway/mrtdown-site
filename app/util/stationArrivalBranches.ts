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
