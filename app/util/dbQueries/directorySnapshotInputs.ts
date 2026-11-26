import type { DateTime } from 'luxon';
import { assembleDataset, scopeDatasetInputs } from './dataset';
import { isoDate } from './dateTime';
import type { StationProfileSnapshotInputs } from './stationProfileSnapshotInputs';

/** Keep the directories' persisted active-day candidate policy as dates move. */
export function assembleDirectorySnapshot(
  inputs: StationProfileSnapshotInputs,
  now: DateTime,
) {
  const rows = inputs.dataset;
  const issueIds = new Set(
    inputs.activeIssueDays
      .filter((row) => row.date === isoDate(now))
      .map((row) => row.issue_id),
  );
  return assembleDataset(
    now,
    scopeDatasetInputs(
      rows,
      {
        lineIds: rows.linesRows.map((row) => row.id),
        serviceIds: rows.serviceRows.map((row) => row.id),
        stationIds: rows.stationRows.map((row) => row.id),
        townIds: rows.townsRows.map((row) => row.id),
        landmarkIds: rows.landmarksRows.map((row) => row.id),
      },
      issueIds,
    ),
  );
}
