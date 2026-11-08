import { Temporal } from '@js-temporal/polyfill';
import {
  type ScheduledServiceCalendar,
  scheduledDeparturesWithPatternsInWindow,
  scheduledServiceDatesForWindow,
} from '@mrtdown/core';
import type { RetainedScheduledDeparture } from '@mrtdown/fs';
import {
  and,
  arrayContains,
  count,
  eq,
  gte,
  inArray,
  isNull,
  lt,
} from 'drizzle-orm';
import z from 'zod';
import type { getDb } from '~/db';
import {
  type combinedDepartureOccurrencesTable,
  scheduledDepartureOccurrencesTable as occurrences,
} from '~/db/scheduledDepartures.schema';
import {
  type BoardingMembership,
  readCombinedDepartureRows,
} from './readCombinedDepartureRows';
import {
  type ExactTimetableScope,
  type IndexedTimetableScope,
  indexedServiceIds,
  type ReadTransaction,
  type ScheduledTimetableSelection,
  type ScheduledTimetableSnapshotOptions,
  type Topology,
  withScheduledTimetableSnapshot,
} from './withSelectedScheduledTimetable';

function dailyCalendar(startDate: string): ScheduledServiceCalendar {
  return {
    providerCalendarId: 'indexed-query-date-candidates',
    weekly: {
      startDate,
      endDate: '9999-12-31',
      weekdays: {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: true,
        sunday: true,
      },
    },
    exceptions: [],
  };
}

function instant(value: string) {
  return new Date(value).toISOString().replace('.000Z', 'Z');
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

type IndexedDepartureOptions<
  Scope extends IndexedTimetableScope = ExactTimetableScope,
> = ScheduledTimetableSnapshotOptions<Scope> & {
  startInstant: string;
  endInstant: string;
  limit?: number;
};

type PlatformSemantics =
  (typeof combinedDepartureOccurrencesTable.$inferSelect)['platform_semantics'];

export type IndexedScheduledDeparture = RetainedScheduledDeparture & {
  serviceId: string;
  revisionId: string;
  platformSemantics?: PlatformSemantics;
  boardingByService?: BoardingMembership[];
};

type IndexedServiceSetDeparture = RetainedScheduledDeparture & {
  platformSemantics?: PlatformSemantics;
  boardingByService: BoardingMembership[];
};

type ServiceSetScope = Extract<IndexedTimetableScope, { serviceIds: string[] }>;

type IndexedDepartures<
  Scope extends IndexedTimetableScope = ExactTimetableScope,
  Departure = IndexedScheduledDeparture,
> = {
  scope: Scope;
  window: { startInstant: string; endInstant: string };
  serviceDays: ScheduledTimetableSelection<Scope>[];
  unavailableProjections: {
    manifestSha256: string;
    reason: ScheduledTimetableSelection['attempts'][number]['reason'];
  }[];
  untimedDepartureCount: number;
  complete: boolean;
  departures: Departure[];
};

function exactServiceDeparture(
  departure: IndexedServiceSetDeparture,
): IndexedScheduledDeparture {
  const { boardingByService, platformSemantics, ...timing } = departure;
  const [member] = boardingByService;
  if (boardingByService.length !== 1) {
    throw new Error('Exact-service departure requires one boarding membership');
  }
  return {
    ...timing,
    ...member,
    ...(platformSemantics === undefined
      ? {}
      : { boardingByService, platformSemantics }),
  };
}

/** Private schedule query using live topology by default; serving approval remains separate. */
export function queryIndexedScheduledDepartures(
  db: ReturnType<typeof getDb>,
  options: IndexedDepartureOptions<ServiceSetScope>,
): Promise<IndexedDepartures<ServiceSetScope, IndexedServiceSetDeparture>>;
export function queryIndexedScheduledDepartures(
  db: ReturnType<typeof getDb>,
  options: IndexedDepartureOptions,
): Promise<IndexedDepartures>;
export function queryIndexedScheduledDepartures(
  db: ReturnType<typeof getDb>,
  options: IndexedDepartureOptions<IndexedTimetableScope>,
) {
  const { scope } = options;
  if (scope.serviceId === undefined) {
    return readIndexedScheduledDepartures(
      db,
      { ...options, scope },
      (departure) => departure,
      async (_tx, result) => result,
    );
  }
  return withIndexedScheduledDepartures(
    db,
    { ...options, scope },
    async (_tx, result) => result,
  );
}

/** Keep dependent canonical reads inside the query's read-only snapshot. */
export function withIndexedScheduledDepartures<T>(
  db: ReturnType<typeof getDb>,
  options: IndexedDepartureOptions,
  use: (
    tx: ReadTransaction,
    result: IndexedDepartures,
    topology: Topology,
  ) => Promise<T>,
) {
  return readIndexedScheduledDepartures(
    db,
    options,
    exactServiceDeparture,
    use,
  );
}

async function readIndexedScheduledDepartures<
  Scope extends IndexedTimetableScope,
  Departure extends RetainedScheduledDeparture,
  T,
>(
  db: ReturnType<typeof getDb>,
  options: IndexedDepartureOptions<Scope>,
  mapDeparture: (departure: IndexedServiceSetDeparture) => Departure,
  use: (
    tx: ReadTransaction,
    result: IndexedDepartures<Scope, Departure>,
    topology: Topology,
  ) => Promise<T>,
): Promise<T> {
  const { startInstant, endInstant } = options;
  const limit = z.number().int().positive().optional().parse(options.limit);
  const window = { startInstant, endInstant };
  // Reuse the shared resolver's instant/order validation before any database work.
  scheduledDeparturesWithPatternsInWindow([], window);
  const start = Temporal.Instant.from(startInstant);
  const end = Temporal.Instant.from(endInstant);
  if (end.epochNanoseconds - start.epochNanoseconds > 86_400_000_000_000n) {
    throw new Error('Departure queries require a window of at most 24 hours');
  }
  // Source offsets resolve to whole seconds. Ceiling both half-open bounds
  // preserves nanosecond request semantics before PostgreSQL rounds timestamps.
  const lowerBound = start
    .round({ smallestUnit: 'second', roundingMode: 'ceil' })
    .toString();
  const upperBound = end
    .round({ smallestUnit: 'second', roundingMode: 'ceil' })
    .toString();
  return withScheduledTimetableSnapshot(db, options, async (tx, snapshot) => {
    const { scope } = snapshot;
    // The helper owns Singapore service-day arithmetic, including 24+ offsets.
    // Current civil dates also need selection when all known times are missing.
    const serviceDates = [
      ...new Set([
        ...scheduledServiceDatesForWindow(
          dailyCalendar('0001-01-01'),
          window,
          snapshot.maximumDepartureSeconds,
        ),
        ...scheduledServiceDatesForWindow(
          dailyCalendar(
            start.toZonedDateTimeISO('Asia/Singapore').toPlainDate().toString(),
          ),
          window,
          86_400,
        ),
      ]),
    ].sort();
    const serviceDays: ScheduledTimetableSelection<Scope>[] = [];
    const departures: {
      departure: Departure;
      occurrenceIndex: number;
    }[] = [];
    let untimedDepartureCount = 0;
    for (const serviceDate of serviceDates) {
      const selection = await snapshot.select(serviceDate);
      serviceDays.push(selection);
      const selected = selection.selected;
      if (!selected) {
        continue;
      }
      const { rows, untimed } =
        selected.version.format === 'combined'
          ? await readCombinedDepartureRows(
              tx,
              scope,
              selected.projectionId,
              serviceDate,
              lowerBound,
              upperBound,
            )
          : await readLegacyDepartureRows(
              tx,
              scope,
              selected.projectionId,
              serviceDate,
              lowerBound,
              upperBound,
            );
      untimedDepartureCount += untimed.count;
      const { manifest, manifestSha256 } = selected.version;
      for (const row of rows) {
        if (row.departure_instant === null) {
          throw new Error('Timed departure query returned an untimed row');
        }
        const boardingByService = row.boardingByService;
        const platformSemantics =
          'platform_semantics' in row ? row.platform_semantics : undefined;
        departures.push({
          occurrenceIndex: row.occurrence_index,
          departure: mapDeparture({
            providerTripId: row.provider_trip_id,
            providerRouteId: row.provider_route_id,
            providerCalendarId: row.provider_calendar_id,
            providerStopId: row.provider_stop_id,
            stopSequence: row.stop_sequence,
            serviceDate: row.service_date,
            stationId: row.station_id,
            lineId: row.line_id,
            destinationStationId: row.destination_station_id,
            platformIds: [
              ...new Set(
                boardingByService.flatMap((member) => member.platformIds),
              ),
            ],
            boardingByService,
            ...(platformSemantics === undefined ? {} : { platformSemantics }),
            arrivalSeconds: row.arrival_seconds,
            departureSeconds: row.departure_seconds,
            arrivalInstant:
              row.arrival_instant === null
                ? null
                : instant(row.arrival_instant),
            departureInstant: instant(row.departure_instant),
            pickupType: row.pickup_type,
            dropOffType: row.drop_off_type,
            timepoint: row.timepoint,
            basis: 'scheduled',
            precision: row.timepoint === 0 ? 'approximate' : 'exact',
            manifestSha256,
            snapshotSha256: manifest.capture.sha256,
            retrievedAt: manifest.capture.retrieved_at,
            correctionRevision: manifest.correctionRevision,
          }),
        });
      }
    }
    // SQL bounds reads by date/scope/window. Merge every date before limiting;
    // source occurrence order breaks ties without interpreting opaque sequences.
    departures.sort(
      (left, right) =>
        Date.parse(left.departure.departureInstant) -
          Date.parse(right.departure.departureInstant) ||
        compareText(left.departure.serviceDate, right.departure.serviceDate) ||
        compareText(
          left.departure.providerTripId,
          right.departure.providerTripId,
        ) ||
        left.occurrenceIndex - right.occurrenceIndex,
    );
    const result: IndexedDepartures<Scope, Departure> = {
      scope,
      window,
      serviceDays,
      unavailableProjections: snapshot.unavailableProjections,
      untimedDepartureCount,
      complete:
        untimedDepartureCount === 0 &&
        snapshot.unavailableProjections.length === 0 &&
        serviceDays.every(({ selected }) => selected !== null),
      departures: (limit === undefined
        ? departures
        : departures.slice(0, limit)
      ).map(({ departure }) => departure),
    };
    return use(tx, result, snapshot.topology);
  });
}

async function readLegacyDepartureRows(
  tx: ReadTransaction,
  scope: IndexedTimetableScope,
  projectionId: number,
  serviceDate: string,
  lowerBound: string,
  upperBound: string,
) {
  const scopeFilter = and(
    eq(occurrences.projection_id, projectionId),
    eq(occurrences.service_date, serviceDate),
    eq(occurrences.station_id, scope.stationId),
    eq(occurrences.line_id, scope.lineId),
    inArray(occurrences.service_id, indexedServiceIds(scope)),
    eq(occurrences.destination_station_id, scope.destinationStationId),
    scope.platformId === undefined
      ? undefined
      : arrayContains(occurrences.platform_ids, [scope.platformId]),
  );
  // Untimed boardable rows cannot be assigned to the instant window. Count
  // the entire selected date/scope independently of the timed result limit.
  const [untimed] = await tx
    .select({ count: count() })
    .from(occurrences)
    .where(and(scopeFilter, isNull(occurrences.departure_instant)));
  const rows = await tx
    .select()
    .from(occurrences)
    .where(
      and(
        scopeFilter,
        gte(occurrences.departure_instant, lowerBound),
        lt(occurrences.departure_instant, upperBound),
      ),
    );
  return {
    untimed,
    rows: rows.map((row) => ({
      ...row,
      boardingByService: [
        {
          serviceId: row.service_id,
          revisionId: row.revision_id,
          platformIds: row.platform_ids,
        },
      ],
    })),
  };
}
