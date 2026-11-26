import { Buffer } from 'node:buffer';
import { createSelectSchema } from 'drizzle-orm/zod';
import type { DateTime } from 'luxon';
import { z } from 'zod';
import {
  landmarksTable,
  lineDayFactsTable,
  operatorsTable,
  stationExitsTable,
  townsTable,
} from '~/db/schema';
import type { PublicCrowdReportSignal } from '~/util/crowdReports';
import {
  assembleDataset,
  type DatasetInputs,
  scopeDatasetInputs,
} from './dataset';
import { getIssueScopeFromInputs } from './readModelScope';
import { RangeSnapshotInputsSchema } from './rangeSnapshotInputs';

const audit = { created_at: true, updated_at: true } as const;
const datasetSchema = RangeSnapshotInputsSchema.extend({
  operatorsRows: z.array(createSelectSchema(operatorsTable).omit(audit)),
  townsRows: z.array(createSelectSchema(townsTable).omit(audit)),
  landmarksRows: z.array(createSelectSchema(landmarksTable).omit(audit)),
});
const schema = z.object({
  dataset: datasetSchema,
  // Keep dates and all persisted rows: ranking uses a moving request-date
  // window over stored facts, not newly synthesized days or a refill TTL.
  lineUptimeFacts: z
    .array(
      createSelectSchema(lineDayFactsTable).pick({
        date: true,
        line_id: true,
        service_seconds: true,
        downtime_disruption_seconds: true,
        downtime_maintenance_seconds: true,
        downtime_infra_seconds: true,
      }),
    )
    .max(100_000),
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
  lineUptimeFacts: z.infer<typeof schema>['lineUptimeFacts'];
  platforms: z.infer<typeof schema>['platforms'];
  exits: z.infer<typeof schema>['exits'];
};
export const parseStationProfileSnapshotInputs = (
  value: unknown,
): StationProfileSnapshotInputs =>
  schema.parse(value) as StationProfileSnapshotInputs;

/** Match PostgreSQL UTF-8 COLLATE "C", independent of process locale. */
export function compareStationProfileIds(a: string, b: string) {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

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
            compareStationProfileIds(a.line_id, b.line_id) ||
            compareStationProfileIds(a.station_id, b.station_id),
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
  const issueScope = getIssueScopeFromInputs(rows, issueIds);
  return {
    resolvedStationId,
    assemble(
      referenceNow: DateTime,
      horizon: DateTime,
      signals: PublicCrowdReportSignal[],
    ) {
      const stationIds = new Set([
        resolvedStationId,
        ...issueScope.stationIds,
        ...signals.flatMap((signal) => signal.stationIds),
      ]);
      const lineIds = new Set([
        ...stationLines,
        ...issueScope.lineIds,
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
      const scope = {
        lineIds: [...lineIds],
        serviceIds: [...serviceIds],
        stationIds: [...stationIds],
        townIds: [...townIds],
        landmarkIds: [...landmarkIds],
        issueTransitionHorizon: horizon,
      };
      const scoped = scopeDatasetInputs(rows, scope, issueIds);
      return {
        resolvedStationId,
        dataset: assembleDataset(referenceNow, scoped, scope),
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
