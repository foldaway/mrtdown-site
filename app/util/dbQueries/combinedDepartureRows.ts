import { Temporal } from '@js-temporal/polyfill';
import {
  projectCombinedTimetableServiceDay,
  type readScheduleTopology,
} from '@mrtdown/fs';
import type {
  combinedDepartureMembershipsTable,
  combinedDepartureOccurrencesTable,
  scheduledDepartureScopesTable,
} from '~/db/scheduledDepartures.schema';

type Artifact = Parameters<typeof projectCombinedTimetableServiceDay>[0];
type Topology = Awaited<ReturnType<typeof readScheduleTopology>>;
type Scope = Omit<
  typeof scheduledDepartureScopesTable.$inferInsert,
  'projection_id'
>;
type Occurrence = Omit<
  typeof combinedDepartureOccurrencesTable.$inferInsert,
  'projection_id'
>;
type Membership = Omit<
  typeof combinedDepartureMembershipsTable.$inferInsert,
  'projection_id'
>;

function scopeKey(scope: {
  station_id: string;
  line_id: string;
  service_id: string;
  destination_station_id: string;
}) {
  return JSON.stringify([
    scope.station_id,
    scope.line_id,
    scope.service_id,
    scope.destination_station_id,
  ]);
}

type ScopeTemplate = Omit<Scope, 'service_date'>;
type RevisionRange = { startAt: string; endAt: string | null };

function revisionCovers({ startAt, endAt }: RevisionRange, date: string) {
  return date >= startAt && (endAt === null || date < endAt);
}

function combinedCoveragePatterns(artifact: Artifact, topology: Topology) {
  const services = new Map(
    topology.services.map((service) => [service.id, service]),
  );
  const stations = new Map(
    topology.stations.map((station) => [station.id, station]),
  );
  const usedPatternIds = new Set(
    artifact.assignments.map(({ patternId }) => patternId),
  );
  const coverage = new Map<
    string,
    { revision: RevisionRange; scopes: ScopeTemplate[] }[]
  >();
  for (const patternId of usedPatternIds) {
    const pattern = artifact.patterns[patternId];
    coverage.set(
      patternId,
      pattern.serviceMemberships.map(({ serviceId, revisionId }) => {
        const service = services.get(serviceId);
        const revision = service?.revisions.find(({ id }) => id === revisionId);
        if (!revision || service?.lineId !== pattern.lineId) {
          throw new Error(
            'Combined timetable membership differs from canonical topology',
          );
        }
        const scopes: ScopeTemplate[] = [];
        for (const call of pattern.calls) {
          const platformIds = call.platforms
            .filter((platform) =>
              platform.accessByService.some(
                (access) =>
                  access.serviceId === serviceId &&
                  access.revisionId === revisionId &&
                  access.passengerBoardingEligible,
              ),
            )
            .map(({ platformId }) => platformId);
          if (!platformIds.length) continue;
          const station = stations.get(call.stationId);
          for (const id of platformIds) {
            const platform = station?.platforms.find(
              (platform) => platform.id === id,
            );
            if (
              !platform ||
              platform.lineId !== pattern.lineId ||
              platform.boardingStatus ||
              (platform.serviceIds.length &&
                !platform.serviceIds.includes(serviceId))
            ) {
              throw new Error(
                'Combined timetable boarding access differs from canonical topology',
              );
            }
          }
          scopes.push({
            station_id: call.stationId,
            line_id: pattern.lineId,
            service_id: serviceId,
            destination_station_id: pattern.destinationStationId,
            platform_ids: platformIds,
          });
        }
        return { revision, scopes };
      }),
    );
  }
  // All effective assignments must belong to their reviewed canonical revisions,
  // including trips that produce no boardable departures.
  for (const { patternId, dateSetId } of artifact.assignments) {
    const dates = artifact.dateSets[dateSetId];
    const members = coverage.get(patternId);
    if (
      !members ||
      members.some(
        ({ revision }) =>
          !revisionCovers(revision, dates[0]) ||
          !revisionCovers(revision, dates[dates.length - 1]),
      )
    ) {
      throw new Error(
        'Combined timetable assignment is outside its canonical revision',
      );
    }
  }
  return [...coverage.values()].flat();
}

/** Coverage follows used patterns and active revisions, even on empty dates. */
export function* combinedDepartureRows(artifact: Artifact, topology: Topology) {
  const { startDate, endDateExclusive } =
    artifact.applicabilityPolicy.serviceDateRange;
  const coveragePatterns = combinedCoveragePatterns(artifact, topology);
  for (
    let date = Temporal.PlainDate.from(startDate);
    date.toString() < endDateExclusive;
    date = date.add({ days: 1 })
  ) {
    const serviceDate = date.toString();
    const projected = projectCombinedTimetableServiceDay(artifact, serviceDate);
    if (!projected) {
      throw new Error(
        'Combined timetable projection did not cover its service date',
      );
    }
    const scopes = new Map<string, Scope>();
    for (const { revision, scopes: templates } of coveragePatterns) {
      if (!revisionCovers(revision, serviceDate)) continue;
      for (const template of templates) {
        const key = scopeKey(template);
        const platform_ids = [
          ...new Set([
            ...(scopes.get(key)?.platform_ids ?? []),
            ...template.platform_ids,
          ]),
        ].sort();
        scopes.set(key, {
          ...template,
          service_date: serviceDate,
          platform_ids,
        });
      }
    }

    function* occurrences(
      departures: NonNullable<
        ReturnType<typeof projectCombinedTimetableServiceDay>
      >['departures'],
    ) {
      for (const stop of departures) {
        const occurrence: Occurrence = {
          service_date: serviceDate,
          provider_trip_id: stop.providerTripId,
          provider_route_id: stop.providerRouteId,
          provider_calendar_id: stop.providerCalendarId,
          provider_stop_id: stop.providerStopId,
          stop_sequence: stop.stopSequence,
          occurrence_index: stop.occurrenceIndex,
          station_id: stop.stationId,
          line_id: stop.lineId,
          destination_station_id: stop.destinationStationId,
          platform_semantics: stop.platformSemantics,
          arrival_seconds: stop.arrivalSeconds,
          departure_seconds: stop.departureSeconds,
          arrival_instant: stop.arrivalInstant,
          departure_instant: stop.departureInstant,
          pickup_type: stop.pickupType,
          drop_off_type: stop.dropOffType,
          timepoint: stop.timepoint,
        };
        const memberships: Membership[] = stop.boardingByService.map(
          (member) => {
            const row = {
              service_date: serviceDate,
              provider_trip_id: stop.providerTripId,
              stop_sequence: stop.stopSequence,
              service_id: member.serviceId,
              revision_id: member.revisionId,
              platform_ids: member.platformIds,
            };
            const coverage = scopes.get(scopeKey({ ...occurrence, ...row }));
            if (
              !coverage ||
              !row.platform_ids.every((id) =>
                coverage.platform_ids.includes(id),
              )
            ) {
              throw new Error(
                'Combined departure is outside verified scope coverage',
              );
            }
            return row;
          },
        );
        yield { occurrence, memberships };
      }
    }

    yield {
      combined: true as const,
      day: {
        service_date: serviceDate,
        active_trip_count: projected.activeTripCount,
        unassigned_active_trip_count: projected.unassignedActiveTripCount,
      },
      scopes: [...scopes.values()],
      occurrences: occurrences(projected.departures),
    };
  }
}
