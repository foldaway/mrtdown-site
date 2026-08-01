import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { DateTime } from 'luxon';
import type { Station } from '~/types';
import {
  crowdArrivalReportsTable,
  publicHolidaysTable,
  serviceRevisionPathStationEntriesTable,
  serviceRevisionsTable,
  servicesTable,
  stationCodesTable,
  stationPlatformServicesTable,
  stationPlatformsTable,
  stationsTable,
} from '~/db/schema';
import {
  filterCurrentCrowdArrivalReports,
  MAX_CROWD_ARRIVAL_REPORT_AGE_MINUTES,
  type EstimatedArrivalService,
  type EstimatedArrivalTiming,
  getEstimatedStationArrivalTimings,
} from '~/util/estimatedArrivals';
import {
  selectServiceRevisionForReferenceDate,
  serviceRevisionHasEnded,
} from '~/util/serviceRevisions';
import { type AppDb, getDefaultDb, timeDbRowsQuery } from './database';
import { isoDate, nowSg, parseDateTime } from './dateTime';
import { parseTranslations } from './dataset';

export type StationArrivalBranch = {
  id: string;
  lineId: string;
  name: Station['name'];
  startedAt: string | null;
  endedAt: string | null;
  estimatedFrequency: EstimatedArrivalService['revision']['estimatedFrequency'];
  entries: Array<{
    stationId: string;
    displayCode: string;
    pathIndex: number;
  }>;
};

type ArrivalStation = Pick<Station, 'id' | 'firstLastTrain'>;

export async function buildStationArrivalLines(input: {
  station: ArrivalStation;
  branches: readonly StationArrivalBranch[];
  referenceNow: DateTime;
  db: AppDb;
  publicHolidayDates?: ReadonlySet<string>;
}) {
  const arrivalBranches = input.branches.filter(
    (branch) =>
      branch.startedAt != null &&
      branch.endedAt == null &&
      branch.entries.some((entry) => entry.stationId === input.station.id),
  );
  const arrivalServiceIds = arrivalBranches.map((branch) => branch.id);
  const destinationStationIds = [
    ...new Set(
      arrivalBranches
        .map((branch) => branch.entries.at(-1)?.stationId)
        .filter((stationId): stationId is string => stationId != null),
    ),
  ];
  const holidaysPromise =
    input.publicHolidayDates == null
      ? timeDbRowsQuery('station_arrivals_q_public_holidays', () =>
          input.db
            .select({ date: publicHolidaysTable.date })
            .from(publicHolidaysTable)
            .where(
              and(
                gte(
                  publicHolidaysTable.date,
                  isoDate(input.referenceNow.minus({ days: 1 })),
                ),
                lte(
                  publicHolidaysTable.date,
                  isoDate(input.referenceNow.plus({ days: 1 })),
                ),
              ),
            ),
        )
      : Promise.resolve([]);
  const [
    platformRows,
    destinationStationRows,
    freshCrowdArrivalRows,
    holidays,
  ] = await Promise.all([
    timeDbRowsQuery('station_arrivals_q_platforms', () =>
      input.db
        .select({
          id: stationPlatformsTable.platform_id,
          label: stationPlatformsTable.label,
          lineId: stationPlatformsTable.line_id,
          boardingStatus: stationPlatformsTable.boarding_status,
          serviceId: stationPlatformServicesTable.service_id,
        })
        .from(stationPlatformsTable)
        .leftJoin(
          stationPlatformServicesTable,
          and(
            eq(
              stationPlatformServicesTable.station_id,
              stationPlatformsTable.station_id,
            ),
            eq(
              stationPlatformServicesTable.platform_id,
              stationPlatformsTable.platform_id,
            ),
          ),
        )
        .where(eq(stationPlatformsTable.station_id, input.station.id)),
    ),
    destinationStationIds.length > 0
      ? timeDbRowsQuery('station_arrivals_q_destinations', () =>
          input.db
            .select({ id: stationsTable.id, name: stationsTable.name })
            .from(stationsTable)
            .where(inArray(stationsTable.id, destinationStationIds)),
        )
      : Promise.resolve([]),
    arrivalServiceIds.length > 0
      ? timeDbRowsQuery('station_arrivals_q_crowd_reports', () =>
          input.db
            .select({
              id: crowdArrivalReportsTable.id,
              reporterHash: crowdArrivalReportsTable.reporter_hash,
              serviceId: crowdArrivalReportsTable.service_id,
              reportedAt: crowdArrivalReportsTable.reported_at,
              minutesToArrival: crowdArrivalReportsTable.minutes_to_arrival,
            })
            .from(crowdArrivalReportsTable)
            .where(
              and(
                eq(crowdArrivalReportsTable.station_id, input.station.id),
                inArray(crowdArrivalReportsTable.service_id, arrivalServiceIds),
                eq(crowdArrivalReportsTable.status, 'accepted'),
                gte(
                  crowdArrivalReportsTable.reported_at,
                  input.referenceNow
                    .minus({
                      minutes: MAX_CROWD_ARRIVAL_REPORT_AGE_MINUTES,
                    })
                    .toISO() ?? '',
                ),
              ),
            )
            .orderBy(desc(crowdArrivalReportsTable.reported_at)),
        )
      : Promise.resolve([]),
    holidaysPromise,
  ]);
  const boardablePlatformLabelsByServiceId = new Map<string, string[]>();
  for (const row of platformRows) {
    if (row.boardingStatus != null || row.serviceId == null) {
      continue;
    }
    const labels = boardablePlatformLabelsByServiceId.get(row.serviceId) ?? [];
    labels.push(row.label);
    boardablePlatformLabelsByServiceId.set(row.serviceId, labels);
  }
  const destinationNameByStationId = Object.fromEntries(
    destinationStationRows.map((destination) => [
      destination.id,
      parseTranslations(destination.name),
    ]),
  );
  const arrivalServices: EstimatedArrivalService[] = arrivalBranches.map(
    (branch) => {
      const destination = branch.entries.at(-1);
      return {
        serviceId: branch.id,
        lineId: branch.lineId,
        serviceName: branch.name,
        destinationStationId: destination?.stationId ?? null,
        destinationCode: destination?.displayCode ?? branch.id,
        destinationName:
          destinationNameByStationId[destination?.stationId ?? ''] ?? null,
        revision: {
          path: {
            stations: branch.entries.map((entry) => ({
              stationId: entry.stationId,
              displayCode: entry.displayCode,
            })),
          },
          estimatedFrequency: branch.estimatedFrequency,
        },
      };
    },
  );
  const currentCrowdArrivalReports = filterCurrentCrowdArrivalReports(
    [
      ...new Map(
        freshCrowdArrivalRows.map((report) => [
          `${report.reporterHash}:${report.serviceId}`,
          report,
        ]),
      ).values(),
    ],
    input.referenceNow,
  );
  const publicHolidayDates =
    input.publicHolidayDates ??
    new Set(holidays.map((holiday) => holiday.date));
  const arrivalTimingsByServiceId = new Map(
    getEstimatedStationArrivalTimings({
      station: input.station,
      services: arrivalServices,
      referenceNow: input.referenceNow,
      publicHolidayDates,
      crowdReports: currentCrowdArrivalReports,
    })
      .map((timing) => ({
        ...timing,
        platformLabels: [
          ...new Set(
            boardablePlatformLabelsByServiceId.get(timing.serviceId) ?? [],
          ),
        ].sort((a, b) => a.localeCompare(b)),
      }))
      .map((timing) => [timing.serviceId, timing] as const),
  );
  const arrivalLinesById = new Map<
    string,
    Array<EstimatedArrivalTiming & { platformLabels: string[] }>
  >();
  for (const service of arrivalServices) {
    const timing = arrivalTimingsByServiceId.get(service.serviceId) ?? {
      serviceId: service.serviceId,
      lineId: service.lineId,
      serviceName: service.serviceName,
      destinationStationId: service.destinationStationId,
      destinationCode: service.destinationCode,
      destinationName: service.destinationName,
      firstTrainTime: null,
      lastTrainTime: null,
      isServiceEnded: false,
      nextServiceStart: null,
      platformLabels: [
        ...new Set(
          boardablePlatformLabelsByServiceId.get(service.serviceId) ?? [],
        ),
      ].sort((a, b) => a.localeCompare(b)),
      departures: [],
    };
    const timings = arrivalLinesById.get(service.lineId) ?? [];
    timings.push(timing);
    arrivalLinesById.set(service.lineId, timings);
  }
  return [...arrivalLinesById]
    .map(([lineId, arrivalTimings]) => ({
      lineId,
      arrivalTimings: arrivalTimings.toSorted((a, b) => {
        const nextDepartureDiff =
          Date.parse(a.departures[0]?.time ?? '') -
          Date.parse(b.departures[0]?.time ?? '');
        return nextDepartureDiff !== 0
          ? nextDepartureDiff
          : a.destinationCode.localeCompare(b.destinationCode);
      }),
    }))
    .sort((a, b) => a.lineId.localeCompare(b.lineId));
}

export async function getStationArrivalLinesReadModel(stationId: string) {
  const referenceNow = nowSg();
  const referenceDate = isoDate(referenceNow);
  const db = await getDefaultDb();
  let [station] = await timeDbRowsQuery('station_arrivals_q_station', () =>
    db
      .select({
        id: stationsTable.id,
        firstLastTrain: stationsTable.first_last_train,
      })
      .from(stationsTable)
      .where(eq(stationsTable.id, stationId))
      .limit(1),
  );
  if (station == null) {
    [station] = await timeDbRowsQuery(
      'station_arrivals_q_station_by_code',
      () =>
        db
          .select({
            id: stationsTable.id,
            firstLastTrain: stationsTable.first_last_train,
          })
          .from(stationCodesTable)
          .innerJoin(
            stationsTable,
            eq(stationsTable.id, stationCodesTable.station_id),
          )
          .where(eq(stationCodesTable.code, stationId))
          .orderBy(
            asc(stationCodesTable.line_id),
            asc(stationCodesTable.station_id),
          )
          .limit(1),
    );
  }
  if (station == null) {
    throw new Response('Station not found', {
      status: 404,
      statusText: 'Not Found',
    });
  }
  const serviceIdRows = await timeDbRowsQuery(
    'station_arrivals_q_station_services',
    () =>
      db
        .selectDistinct({
          serviceId: serviceRevisionPathStationEntriesTable.service_id,
        })
        .from(serviceRevisionPathStationEntriesTable)
        .where(
          eq(serviceRevisionPathStationEntriesTable.station_id, station.id),
        ),
  );
  const serviceIds = serviceIdRows.map((row) => row.serviceId);
  if (serviceIds.length === 0) {
    return [];
  }
  const [serviceRows, revisionRows] = await Promise.all([
    timeDbRowsQuery('station_arrivals_q_services', () =>
      db
        .select({
          id: servicesTable.id,
          lineId: servicesTable.line_id,
          name: servicesTable.name,
        })
        .from(servicesTable)
        .where(inArray(servicesTable.id, serviceIds)),
    ),
    timeDbRowsQuery('station_arrivals_q_revisions', () =>
      db
        .select({
          id: serviceRevisionsTable.id,
          service_id: serviceRevisionsTable.service_id,
          start_at: serviceRevisionsTable.start_at,
          end_at: serviceRevisionsTable.end_at,
          updated_at: serviceRevisionsTable.updated_at,
          estimatedFrequency: serviceRevisionsTable.estimated_frequency,
        })
        .from(serviceRevisionsTable)
        .where(inArray(serviceRevisionsTable.service_id, serviceIds)),
    ),
  ]);
  const revisionIds = revisionRows.map((row) => row.id);
  const pathRows = await timeDbRowsQuery('station_arrivals_q_paths', () =>
    db
      .select({
        revisionId: serviceRevisionPathStationEntriesTable.service_revision_id,
        serviceId: serviceRevisionPathStationEntriesTable.service_id,
        stationId: serviceRevisionPathStationEntriesTable.station_id,
        displayCode: serviceRevisionPathStationEntriesTable.display_code,
        pathIndex: serviceRevisionPathStationEntriesTable.path_index,
      })
      .from(serviceRevisionPathStationEntriesTable)
      .where(
        inArray(
          serviceRevisionPathStationEntriesTable.service_revision_id,
          revisionIds,
        ),
      ),
  );
  const pathStationIds = [...new Set(pathRows.map((row) => row.stationId))];
  const lineIds = [...new Set(serviceRows.map((row) => row.lineId))];
  const stationCodeRows = await timeDbRowsQuery(
    'station_arrivals_q_codes',
    () =>
      db
        .select({
          stationId: stationCodesTable.station_id,
          lineId: stationCodesTable.line_id,
          code: stationCodesTable.code,
          startedAt: stationCodesTable.started_at,
          endedAt: stationCodesTable.ended_at,
        })
        .from(stationCodesTable)
        .where(
          and(
            inArray(stationCodesTable.station_id, pathStationIds),
            inArray(stationCodesTable.line_id, lineIds),
          ),
        ),
  );
  const revisionsByServiceId = Map.groupBy(
    revisionRows,
    (row) => row.service_id,
  );
  const pathsByRevisionKey = Map.groupBy(
    pathRows,
    (row) => `${row.revisionId}::${row.serviceId}`,
  );
  const stationCodesByKey = new Map(
    stationCodeRows.map((row) => [
      `${row.stationId}::${row.lineId}::${row.code}`,
      row,
    ]),
  );
  const branches: StationArrivalBranch[] = serviceRows.flatMap((service) => {
    const revisions = revisionsByServiceId.get(service.id) ?? [];
    const revisionForReferenceDate = selectServiceRevisionForReferenceDate(
      revisions,
      referenceDate,
    );
    const revision = selectServiceRevisionForReferenceDate(
      revisions.filter(
        (candidate) =>
          (pathsByRevisionKey.get(`${candidate.id}::${service.id}`)?.length ??
            0) > 0,
      ),
      referenceDate,
    );
    if (revision == null) {
      return [];
    }
    const entries = [
      ...(pathsByRevisionKey.get(`${revision.id}::${service.id}`) ?? []),
    ]
      .sort((a, b) => a.pathIndex - b.pathIndex)
      .map((entry) => ({
        stationId: entry.stationId,
        displayCode: entry.displayCode,
        pathIndex: entry.pathIndex,
      }));
    const startedDates = entries
      .map((entry) =>
        stationCodesByKey.get(
          `${entry.stationId}::${service.lineId}::${entry.displayCode}`,
        ),
      )
      .map((code) => code?.startedAt)
      .filter((value): value is string => value != null)
      .map((value) => parseDateTime(value));
    const endedDates = entries
      .map((entry) =>
        stationCodesByKey.get(
          `${entry.stationId}::${service.lineId}::${entry.displayCode}`,
        ),
      )
      .map((code) => code?.endedAt)
      .filter((value): value is string => value != null)
      .map((value) => parseDateTime(value));
    const revisionStartDate =
      revision.start_at != null ? parseDateTime(revision.start_at) : null;
    const effectiveStart =
      revisionStartDate ??
      startedDates.sort((a, b) => a.toMillis() - b.toMillis())[0] ??
      null;
    const endedAtByStationCode =
      endedDates.length === entries.length
        ? (endedDates
            .sort((a, b) => b.toMillis() - a.toMillis())[0]
            ?.toISODate() ?? null)
        : null;
    const endedAt =
      endedAtByStationCode != null && endedAtByStationCode <= referenceDate
        ? endedAtByStationCode
        : serviceRevisionHasEnded(revision, referenceDate)
          ? revision.end_at
          : revisionForReferenceDate != null &&
              revisionForReferenceDate.id !== revision.id &&
              serviceRevisionHasEnded(revisionForReferenceDate, referenceDate)
            ? revisionForReferenceDate.end_at
            : null;
    return [
      {
        id: service.id,
        lineId: service.lineId,
        name: parseTranslations(service.name),
        estimatedFrequency: revision.estimatedFrequency ?? undefined,
        startedAt:
          effectiveStart != null && effectiveStart <= referenceNow
            ? effectiveStart.toISODate()
            : null,
        endedAt,
        entries,
      },
    ];
  });
  return buildStationArrivalLines({
    station: {
      id: station.id,
      firstLastTrain: station.firstLastTrain ?? undefined,
    },
    branches,
    referenceNow,
    db,
  });
}
