import type { RetainedScheduledDeparture } from '@mrtdown/fs';
import type { queryIndexedScheduledDepartures } from './dbQueries/queryIndexedScheduledDepartures';
import type { Station } from '@mrtdown/core';

type IndexedDepartures = Awaited<
  ReturnType<typeof queryIndexedScheduledDepartures>
>;

export type ScheduledArrivalDisplay = {
  serviceName: Station['name'];
  destinationCode: string;
  destinationName: Station['name'] | null;
  platformLabelsById: ReadonlyMap<string, string>;
};

export type ScheduledArrivalDeparture = RetainedScheduledDeparture & {
  time: string;
};

export type ScheduledArrivalTiming = Pick<
  ScheduledArrivalDisplay,
  'serviceName' | 'destinationCode' | 'destinationName'
> & {
  stationId: string;
  lineId: string;
  serviceId: string;
  destinationStationId: string;
  platformIds: string[];
  platformLabels: string[];
  departures: ScheduledArrivalDeparture[];
};

export type ScheduledStationArrivals = Omit<IndexedDepartures, 'departures'> & {
  basis: 'scheduled';
  lines: { lineId: string; arrivalTimings: ScheduledArrivalTiming[] }[];
};

/** Pure internal mapping of one validated query scope; no serving/fallback decision. */
export function buildScheduledStationArrivalLines(
  result: IndexedDepartures,
  display: ScheduledArrivalDisplay,
): ScheduledStationArrivals {
  const { departures, ...coverage } = result;
  const { stationId, lineId, serviceId, destinationStationId } = result.scope;
  const timingsByPlatforms = new Map<string, ScheduledArrivalTiming>();
  for (const departure of departures) {
    // Alternatives are one boarding choice, not separate trains. Compare IDs as
    // a set without changing source order or deriving eligibility from labels.
    const platformIds = [...departure.platformIds].sort();
    const key = JSON.stringify(platformIds);
    let timing = timingsByPlatforms.get(key);
    if (!timing) {
      timing = {
        stationId,
        lineId,
        serviceId,
        destinationStationId,
        serviceName: display.serviceName,
        destinationCode: display.destinationCode,
        destinationName: display.destinationName,
        platformIds,
        platformLabels: platformIds.map(
          (id) => display.platformLabelsById.get(id) ?? id,
        ),
        departures: [],
      };
      timingsByPlatforms.set(key, timing);
    }
    timing.departures.push({ ...departure, time: departure.departureInstant });
  }
  return {
    ...coverage,
    basis: 'scheduled',
    lines: [{ lineId, arrivalTimings: [...timingsByPlatforms.values()] }],
  };
}
