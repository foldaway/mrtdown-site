import {
  isScheduledServiceDate,
  type ScheduledAssignedTimetable,
  scheduledTripWithPatternOnDate,
} from '@mrtdown/core';
import type { readScheduleTopology } from '@mrtdown/fs';
import type {
  scheduledDepartureDaysTable,
  scheduledDepartureOccurrencesTable,
  scheduledDepartureScopesTable,
} from '~/db/scheduledDepartures.schema';

type Scope = Omit<
  typeof scheduledDepartureScopesTable.$inferInsert,
  'projection_id'
>;
type Occurrence = Omit<
  typeof scheduledDepartureOccurrencesTable.$inferInsert,
  'projection_id'
>;
type Day = Omit<
  typeof scheduledDepartureDaysTable.$inferInsert,
  'projection_id'
>;
type Topology = Awaited<ReturnType<typeof readScheduleTopology>>;

function scopeKey(scope: Scope) {
  return JSON.stringify([
    scope.station_id,
    scope.line_id,
    scope.service_id,
    scope.destination_station_id,
  ]);
}

/** Mirrors the shared retained selector's used-pattern/active-revision coverage. */
function dateScopes(
  timetable: ScheduledAssignedTimetable,
  topology: Topology,
  serviceDate: string,
) {
  const used = new Set(timetable.assignments.map(({ patternId }) => patternId));
  const scopes = new Map<string, Scope>();
  for (const { id, pattern } of timetable.patterns) {
    const revision = topology.services
      .find(({ id }) => id === pattern.serviceId)
      ?.revisions.find(({ id }) => id === pattern.revisionId);
    if (
      !used.has(id) ||
      !revision ||
      serviceDate < revision.startAt ||
      (revision.endAt !== null && serviceDate >= revision.endAt)
    ) {
      continue;
    }
    for (const stop of pattern.stops.slice(0, -1)) {
      const scope: Scope = {
        service_date: serviceDate,
        station_id: stop.stationId,
        line_id: pattern.lineId,
        service_id: pattern.serviceId,
        destination_station_id: pattern.destinationStationId,
        platform_ids: stop.platformIds,
      };
      const key = scopeKey(scope);
      scope.platform_ids = [
        ...new Set([
          ...(scopes.get(key)?.platform_ids ?? []),
          ...stop.platformIds,
        ]),
      ].sort();
      scopes.set(key, scope);
    }
  }
  return scopes;
}

/** One date and at most one resolved trip at a time; untimed candidates survive. */
export function* scheduledDepartureRows(
  timetable: ScheduledAssignedTimetable,
  topology: Topology,
  feedRange: { startDate: string; endDate: string },
): Generator<{
  day: Day;
  scopes: Scope[];
  occurrences: Generator<Occurrence>;
}> {
  const calendars = new Map(
    timetable.timetable.calendars.map((calendar) => [
      calendar.providerCalendarId,
      calendar,
    ]),
  );
  const patterns = new Map(
    timetable.patterns.map(({ id, pattern }) => [id, pattern]),
  );
  const start = Date.parse(`${feedRange.startDate}T00:00:00Z`);
  const end = Date.parse(`${feedRange.endDate}T00:00:00Z`);
  for (let instant = start; instant <= end; instant += 86_400_000) {
    const serviceDate = new Date(instant).toISOString().slice(0, 10);
    const activeCalendars = new Set(
      [...calendars.values()]
        .filter((calendar) => isScheduledServiceDate(calendar, serviceDate))
        .map(({ providerCalendarId }) => providerCalendarId),
    );
    const assigned = new Map(
      timetable.assignments
        .filter(({ dateRanges }) =>
          dateRanges.some(
            ({ startDate, endDate }) =>
              serviceDate >= startDate && serviceDate <= endDate,
          ),
        )
        .map((assignment) => [assignment.providerTripId, assignment]),
    );
    const day: Day = {
      service_date: serviceDate,
      active_trip_count: 0,
      unassigned_active_trip_count: 0,
    };
    for (const trip of timetable.timetable.trips) {
      if (activeCalendars.has(trip.providerCalendarId)) {
        day.active_trip_count++;
        if (!assigned.has(trip.providerTripId)) {
          day.unassigned_active_trip_count++;
        }
      }
    }
    const scopes = dateScopes(timetable, topology, serviceDate);
    function* occurrences(): Generator<Occurrence> {
      for (const trip of timetable.timetable.trips) {
        const assignment = assigned.get(trip.providerTripId);
        if (!assignment || !activeCalendars.has(trip.providerCalendarId)) {
          continue;
        }
        const pattern = patterns.get(assignment.patternId);
        const calendar = calendars.get(trip.providerCalendarId);
        if (!pattern || !calendar) {
          throw new Error('Missing verified projection assignment reference');
        }
        const resolved = scheduledTripWithPatternOnDate(
          trip,
          calendar,
          [
            {
              serviceDates: [serviceDate],
              binding: {
                providerTripId: trip.providerTripId,
                pattern,
                occurrences: trip.stopTimes.map(
                  ({ providerStopId, stopSequence }) => ({
                    providerStopId,
                    stopSequence,
                  }),
                ),
              },
            },
          ],
          serviceDate,
        );
        if (!resolved) {
          throw new Error('Verified active trip did not resolve');
        }
        const lastAlighting = resolved.stopTimes.findLastIndex(
          (stop) => stop.dropOffType !== 1,
        );
        for (const [index, stop] of resolved.stopTimes.entries()) {
          if (stop.pickupType === 1 || index >= lastAlighting) {
            continue;
          }
          const row: Occurrence = {
            service_date: serviceDate,
            provider_trip_id: trip.providerTripId,
            provider_route_id: trip.providerRouteId,
            provider_calendar_id: trip.providerCalendarId,
            provider_stop_id: stop.providerStopId,
            stop_sequence: stop.stopSequence,
            occurrence_index: index,
            station_id: stop.stationId,
            line_id: resolved.lineId,
            service_id: resolved.serviceId,
            revision_id: resolved.revisionId,
            destination_station_id: resolved.destinationStationId,
            platform_ids: stop.platformIds,
            arrival_seconds: stop.arrivalSeconds,
            departure_seconds: stop.departureSeconds,
            arrival_instant: stop.arrivalInstant,
            departure_instant: stop.departureInstant,
            pickup_type: stop.pickupType,
            drop_off_type: stop.dropOffType,
            timepoint: stop.timepoint,
          };
          const coverage = scopes.get(scopeKey(row));
          if (
            !coverage ||
            !row.platform_ids.every((id) => coverage.platform_ids.includes(id))
          ) {
            throw new Error('Departure is outside verified scope coverage');
          }
          yield row;
        }
      }
    }
    yield { day, scopes: [...scopes.values()], occurrences: occurrences() };
  }
}
