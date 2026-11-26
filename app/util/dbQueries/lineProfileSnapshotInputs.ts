import type { DateTime } from 'luxon';
import type { PublicCrowdReportSignal } from '~/util/crowdReports';
import { scopeDatasetInputs } from './dataset';
import { isoDate } from './dateTime';
import { getIssueScopeFromInputs } from './readModelScope';
import type { StationProfileSnapshotInputs } from './stationProfileSnapshotInputs';

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
  const events = new Set(
    [
      ...rows.impactEventServiceRows.filter((row) =>
        lineServices.has(row.service_id),
      ),
      ...rows.impactEventFacilityRows.filter(
        (row) => row.line_id === lineId || lineStations.has(row.station_id),
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
    ...lineStations,
    ...issueScope.stationIds,
    ...signals.flatMap((signal) => signal.stationIds),
  ]);
  const lineIds = new Set([
    lineId,
    ...issueScope.lineIds,
    ...signals.flatMap((signal) => signal.lineIds),
    ...rows.stationCodesRows
      .filter((row) => stationIds.has(row.station_id))
      .map((row) => row.line_id),
  ]);
  const dataset = scopeDatasetInputs(
    rows,
    {
      lineIds: [...lineIds],
      stationIds: [...stationIds],
      serviceIds: [...new Set([...lineServices, ...issueScope.serviceIds])],
    },
    issueIds,
  );
  // Scoped SQL loads only the root line's operators, even if issues or signals
  // bring in other lines. Preserve that included-entity contract.
  const operatorIds = new Set(
    rows.lineOperatorsRows
      .filter((row) => row.line_id === lineId)
      .map((row) => row.operator_id),
  );
  dataset.operatorsRows = rows.operatorsRows.filter((row) =>
    operatorIds.has(row.id),
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
