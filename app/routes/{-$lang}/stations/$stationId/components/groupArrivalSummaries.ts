import type { StationArrivalsV2 } from '~/util/stationArrivalsV2';
import {
  type ArrivalStates,
  arrivalBranchKey,
  type BranchArrivalState,
} from './stationArrivalRefresh';
import type { ArrivalTiming } from './stationGuide.types';

type ScheduledResponse = Extract<StationArrivalsV2, { source: 'scheduled' }>;
type Departure = ScheduledResponse['timings'][number]['departures'][number];

export type ArrivalSummaryMember = {
  arrivalTiming: ArrivalTiming;
  arrivalState?: BranchArrivalState;
  showReports?: boolean;
};

/** Share a display, never infer shared train identity from matching times. */
export function groupArrivalSummaries(
  timings: ArrivalTiming[],
  states: ArrivalStates,
  now: number | null,
) {
  const groups: ArrivalSummaryMember[][] = [];
  const matching = new Map<string, ArrivalSummaryMember[]>();
  for (const arrivalTiming of timings) {
    const arrivalState =
      states[
        arrivalBranchKey(
          arrivalTiming.lineId,
          arrivalTiming.serviceId,
          arrivalTiming.destinationStationId,
        )
      ];
    const member = { arrivalTiming, arrivalState };
    const data = arrivalState?.data;
    if (
      !arrivalState ||
      arrivalState.status === 'error' ||
      data?.source !== 'scheduled' ||
      !data.coverage.complete ||
      !data.timings.some((timing) =>
        timing.departures.some(
          ({ time }) => now == null || Date.parse(time) > now,
        ),
      )
    ) {
      groups.push([member]);
      continue;
    }
    const firstTimed = data.timings.findIndex((timing) =>
      timing.departures.some(
        ({ time }) => now == null || Date.parse(time) > now,
      ),
    );
    for (const [index, timing] of data.timings.entries()) {
      const platformMember: ArrivalSummaryMember = {
        arrivalTiming,
        arrivalState: { ...arrivalState, data: { ...data, timings: [timing] } },
        // Reports describe the canonical branch, not each platform row.
        showReports: index === firstTimed,
      };
      const departures = timing.departures.filter(
        ({ time }) => now == null || Date.parse(time) > now,
      );
      if (!departures.length) {
        groups.push([platformMember]);
        continue;
      }
      const key = JSON.stringify([
        data.scope.stationId,
        data.scope.lineId,
        data.scope.destinationStationId,
        arrivalTiming.isLoop ?? false,
        arrivalTiming.viaStationId ?? null,
        timing.platforms.map(({ id }) => id).sort(),
        data.coverage.serviceDays.map(({ serviceDate, source }) => [
          serviceDate,
          source,
        ]),
      ]);
      const existing = matching.get(key);
      if (existing) {
        existing.push(platformMember);
      } else {
        const group = [platformMember];
        matching.set(key, group);
        groups.push(group);
      }
    }
  }
  return groups;
}

/** Combine time slots for display; original per-service responses stay intact. */
export function sharedArrivalDisplay(members: ArrivalSummaryMember[]) {
  const data = members[0].arrivalState?.data;
  if (!data || data.source !== 'scheduled' || members.length < 2) return null;
  const slots = new Map<
    string,
    { departure: Departure; services: ArrivalTiming[] }[]
  >();
  for (const { arrivalTiming, arrivalState } of members) {
    const response = arrivalState?.data;
    if (response?.source !== 'scheduled') return null;
    for (const departure of response.timings[0].departures) {
      const key = JSON.stringify([
        Date.parse(departure.time),
        departure.precision,
        departure.serviceDate,
        departure.manifestSha256,
        departure.snapshotSha256,
      ]);
      const matches = slots.get(key) ?? [];
      const match = matches.find(
        ({ services }) =>
          !services.some(
            ({ serviceId }) => serviceId === arrivalTiming.serviceId,
          ),
      );
      if (match) match.services.push(arrivalTiming);
      else matches.push({ departure, services: [arrivalTiming] });
      slots.set(key, matches);
    }
  }
  const ordered = [...slots.values()]
    .flat()
    .sort(
      (a, b) => Date.parse(a.departure.time) - Date.parse(b.departure.time),
    );
  const showServices = ordered.some(
    ({ services }) => services.length !== members.length,
  );
  return {
    data: {
      ...data,
      timings: [
        {
          ...data.timings[0],
          departures: ordered.map(({ departure }) => departure),
        },
      ],
    },
    departureServices: showServices
      ? new Map(ordered.map(({ departure, services }) => [departure, services]))
      : undefined,
  };
}
