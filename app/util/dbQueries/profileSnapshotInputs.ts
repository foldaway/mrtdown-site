import type { DateTime } from 'luxon';
import type { PublicCrowdReportSignal } from '~/util/crowdReports';
import {
  scopeDatasetInputs,
  type DatasetInputs,
  type DatasetStaticScope,
} from './dataset';
import { isoDate } from './dateTime';
import { getIssueScopeFromInputs } from './readModelScope';
import type { StationProfileSnapshotInputs } from './stationProfileSnapshotInputs';

/** Shared SQL profile policy: historical candidates, issue scope, memberships. */
export function selectProfileDatasetInputs(
  rows: DatasetInputs,
  scope: DatasetStaticScope,
  additional: Pick<DatasetStaticScope, 'lineIds' | 'stationIds'> = {
    lineIds: [],
    stationIds: [],
  },
) {
  const rootLineIds = new Set(scope.lineIds);
  const serviceIds = new Set(scope.serviceIds);
  const rootStationIds = new Set(scope.stationIds);
  const events = new Set(
    [
      ...rows.impactEventServiceRows.filter((row) =>
        serviceIds.has(row.service_id),
      ),
      ...rows.impactEventFacilityRows.filter(
        (row) =>
          rootLineIds.has(row.line_id ?? '') ||
          rootStationIds.has(row.station_id),
      ),
    ].map((row) => row.impact_event_id),
  );
  const issueIds = new Set(
    rows.impactEventRows
      .filter((row) => events.has(row.id))
      .map((row) => row.issue_id),
  );
  const issueScope = getIssueScopeFromInputs(rows, issueIds);
  const stationIds = new Set([
    ...rootStationIds,
    ...issueScope.stationIds,
    ...additional.stationIds,
  ]);
  const lineIds = new Set([
    ...rootLineIds,
    ...issueScope.lineIds,
    ...additional.lineIds,
    ...rows.stationCodesRows
      .filter((row) => stationIds.has(row.station_id))
      .map((row) => row.line_id),
  ]);
  const dataset = scopeDatasetInputs(
    rows,
    {
      ...scope,
      lineIds: [...lineIds],
      stationIds: [...stationIds],
      serviceIds: [...new Set([...serviceIds, ...issueScope.serviceIds])],
    },
    issueIds,
  );
  const operatorIds = new Set(scope.operatorIds ?? []);
  dataset.operatorsRows = rows.operatorsRows.filter((row) =>
    operatorIds.has(row.id),
  );
  return dataset;
}

/** Match the line SQL reader's historical candidates and static scope. */
export function selectLineProfileSnapshot(
  inputs: StationProfileSnapshotInputs,
  lineId: string,
  days: number,
  referenceNow: DateTime,
  signals: PublicCrowdReportSignal[],
) {
  const rows = inputs.dataset;
  const lineServices = new Set(
    rows.serviceRows
      .filter((row) => row.line_id === lineId)
      .map((row) => row.id),
  );
  const lineStations = new Set([
    ...rows.servicePathRows
      .filter((row) => lineServices.has(row.service_id))
      .map((row) => row.station_id),
    ...rows.stationCodesRows
      .filter((row) => row.line_id === lineId)
      .map((row) => row.station_id),
  ]);
  const dataset = selectProfileDatasetInputs(
    rows,
    {
      lineIds: [lineId],
      serviceIds: [...lineServices],
      stationIds: [...lineStations],
      operatorIds: rows.lineOperatorsRows
        .filter((row) => row.line_id === lineId)
        .map((row) => row.operator_id),
    },
    {
      lineIds: signals.flatMap((signal) => signal.lineIds),
      stationIds: signals.flatMap((signal) => signal.stationIds),
    },
  );
  const start = isoDate(referenceNow.startOf('day').minus({ days: days - 1 }));
  const end = isoDate(referenceNow);
  return {
    dataset,
    uptimeFactRows: inputs.lineUptimeFacts.filter(
      (row) => row.date >= start && row.date <= end,
    ),
  };
}
