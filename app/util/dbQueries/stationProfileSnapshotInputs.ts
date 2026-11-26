import { createSelectSchema } from 'drizzle-orm/zod';
import type { DateTime } from 'luxon';
import { z } from 'zod';
import { landmarksTable, stationExitsTable, townsTable } from '~/db/schema';
import type { PublicCrowdReportSignal } from '~/util/crowdReports';
import { assembleDataset, type DatasetInputs } from './dataset';
import { RangeSnapshotInputsSchema } from './rangeSnapshotInputs';

const audit = { created_at: true, updated_at: true } as const;
const datasetSchema = RangeSnapshotInputsSchema.extend({
  townsRows: z.array(createSelectSchema(townsTable).omit(audit)),
  landmarksRows: z.array(createSelectSchema(landmarksTable).omit(audit)),
});
const schema = z.object({
  dataset: datasetSchema,
  platforms: z.array(
    z.object({
      stationId: z.string(),
      id: z.string(),
      label: z.string(),
      lineId: z.string(),
      boardingStatus: z.enum(['alighting_only', 'not_in_service']).nullable(),
      serviceId: z.string().nullable(),
    }),
  ),
  exits: z.array(
    z.object({
      stationId: z.string(),
      id: z.number().int(),
      label: createSelectSchema(stationExitsTable).shape.label,
    }),
  ),
});
export type StationProfileSnapshotInputs = {
  dataset: DatasetInputs;
  platforms: z.infer<typeof schema>['platforms'];
  exits: z.infer<typeof schema>['exits'];
};
export const parseStationProfileSnapshotInputs = (
  value: unknown,
): StationProfileSnapshotInputs =>
  schema.parse(value) as StationProfileSnapshotInputs;

/** Mirror the SQL reader's candidate and static scope, before clock selection. */
export function selectStationProfileSnapshot(
  inputs: StationProfileSnapshotInputs,
  idOrCode: string,
) {
  const rows = inputs.dataset;
  const resolvedStationId = rows.stationRows.some((row) => row.id === idOrCode)
    ? idOrCode
    : rows.stationCodesRows
        .filter((row) => row.code === idOrCode)
        .sort(
          (a, b) =>
            a.line_id.localeCompare(b.line_id) ||
            a.station_id.localeCompare(b.station_id),
        )[0]?.station_id;
  if (!resolvedStationId) return null;
  const stationLines = new Set(
    rows.stationCodesRows
      .filter((row) => row.station_id === resolvedStationId)
      .map((row) => row.line_id),
  );
  const stationServices = new Set(
    rows.serviceRows
      .filter((row) => stationLines.has(row.line_id))
      .map((row) => row.id),
  );
  const candidateEvents = new Set(
    [
      ...rows.impactEventFacilityRows.filter(
        (row) => row.station_id === resolvedStationId,
      ),
      ...rows.impactEventServiceRows.filter((row) =>
        stationServices.has(row.service_id),
      ),
    ].map((row) => row.impact_event_id),
  );
  const issueIds = new Set(
    rows.impactEventRows
      .filter((row) => candidateEvents.has(row.id))
      .map((row) => row.issue_id),
  );
  const eventIds = new Set(
    rows.impactEventRows
      .filter((row) => issueIds.has(row.issue_id))
      .map((row) => row.id),
  );
  const facilities = rows.impactEventFacilityRows.filter((row) =>
    eventIds.has(row.impact_event_id),
  );
  const services = new Set(
    rows.impactEventServiceRows
      .filter((row) => eventIds.has(row.impact_event_id))
      .map((row) => row.service_id),
  );
  const affectedLines = new Set([
    ...facilities.flatMap((row) => (row.line_id ? [row.line_id] : [])),
    ...rows.serviceRows
      .filter((row) => services.has(row.id))
      .map((row) => row.line_id),
  ]);
  const affectedServices = new Set(
    rows.serviceRows
      .filter((row) => affectedLines.has(row.line_id))
      .map((row) => row.id),
  );
  const affectedStations = new Set([
    ...facilities.map((row) => row.station_id),
    ...rows.servicePathRows
      .filter((row) => affectedServices.has(row.service_id))
      .map((row) => row.station_id),
  ]);
  const issueLines = new Set([
    ...affectedLines,
    ...rows.stationCodesRows
      .filter((row) => affectedStations.has(row.station_id))
      .map((row) => row.line_id),
  ]);
  return {
    resolvedStationId,
    assemble(
      referenceNow: DateTime,
      horizon: DateTime,
      signals: PublicCrowdReportSignal[],
    ) {
      const stationIds = new Set([
        resolvedStationId,
        ...affectedStations,
        ...signals.flatMap((signal) => signal.stationIds),
      ]);
      const lineIds = new Set([
        ...stationLines,
        ...issueLines,
        ...signals.flatMap((signal) => signal.lineIds),
        ...rows.stationCodesRows
          .filter((row) => stationIds.has(row.station_id))
          .map((row) => row.line_id),
      ]);
      const serviceIds = new Set(
        rows.serviceRows
          .filter((row) => lineIds.has(row.line_id))
          .map((row) => row.id),
      );
      const townIds = new Set(
        rows.stationRows
          .filter((row) => stationIds.has(row.id))
          .map((row) => row.townId),
      );
      const landmarkIds = new Set(
        rows.stationLandmarksRows
          .filter((row) => stationIds.has(row.station_id))
          .map((row) => row.landmark_id),
      );
      const scoped = {
        ...rows,
        linesRows: rows.linesRows.filter((row) => lineIds.has(row.id)),
        lineOperatorsRows: rows.lineOperatorsRows.filter((row) =>
          lineIds.has(row.line_id),
        ),
        stationRows: rows.stationRows.filter((row) => stationIds.has(row.id)),
        stationCodesRows: rows.stationCodesRows.filter((row) =>
          stationIds.has(row.station_id),
        ),
        stationLandmarksRows: rows.stationLandmarksRows.filter((row) =>
          stationIds.has(row.station_id),
        ),
        serviceRows: rows.serviceRows.filter((row) => serviceIds.has(row.id)),
        serviceRevisionRows: rows.serviceRevisionRows.filter((row) =>
          serviceIds.has(row.service_id),
        ),
        servicePathRows: rows.servicePathRows.filter((row) =>
          serviceIds.has(row.service_id),
        ),
        townsRows: rows.townsRows.filter((row) => townIds.has(row.id)),
        landmarksRows: rows.landmarksRows.filter((row) =>
          landmarkIds.has(row.id),
        ),
        issueRows: rows.issueRows.filter((row) => issueIds.has(row.id)),
      };
      return {
        resolvedStationId,
        dataset: assembleDataset(referenceNow, scoped as DatasetInputs, {
          lineIds: [...lineIds],
          serviceIds: [...serviceIds],
          stationIds: [...stationIds],
          issueTransitionHorizon: horizon,
        }),
        platformRows: inputs.platforms.filter(
          (row) => row.stationId === resolvedStationId,
        ),
        exitRows: inputs.exits
          .filter((row) => row.stationId === resolvedStationId)
          .map(({ id, label }) => ({ id, label })),
      };
    },
  };
}
