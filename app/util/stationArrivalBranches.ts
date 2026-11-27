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
  platformViaStations?: {
    platformId: string;
    stationId: string;
    stationName: Station['name'];
  }[];
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

/** Reviewed BP6_B allocation: platform 2 boards the outbound loop visit. */
export function loopPlatformViaStations(
  path: readonly { stationId: string }[],
  serviceId: string,
  stationId: string,
) {
  if (stationId !== 'BKP' || !isLoopPath(path, 'CCK')) return [];
  const via =
    serviceId === 'BPLRT_A' ? 'SNJ' : serviceId === 'BPLRT_B' ? 'PTR' : null;
  const visits = path.flatMap((entry, index) =>
    entry.stationId === stationId ? [index] : [],
  );
  // Fail closed if the canonical route no longer matches the reviewed legs.
  if (
    !via ||
    visits.length !== 2 ||
    path[visits[0] + 1]?.stationId !== via ||
    path[visits[1] + 1]?.stationId !== 'PNX'
  )
    return [];
  return [{ platformId: 'BKP_BPLRT_2', stationId: via }];
}
