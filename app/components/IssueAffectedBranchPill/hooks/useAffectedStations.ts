import { useMemo } from 'react';
import type { IssueAffectedBranch, Line, Station } from '~/types';
import { useIncludedEntities } from '~/contexts/IncludedEntities';

interface UseAffectedStationsReturn {
  line: Line;
  source: Station | null;
  destination: Station | null;
  allStations: Station[];
}

export function sortAffectedStationsByBranch(
  affectedStations: readonly Station[],
  branch: Pick<IssueAffectedBranch, 'branchId' | 'lineId'>,
) {
  return [...affectedStations].sort((first, second) => {
    const findMembership = (station: Station) =>
      station.memberships.find(
        (membership) =>
          membership.branchId === branch.branchId &&
          membership.lineId === branch.lineId,
      ) ??
      station.memberships.find(
        (membership) => membership.lineId === branch.lineId,
      );

    const firstMembership = findMembership(first);
    const secondMembership = findMembership(second);

    if (firstMembership == null || secondMembership == null) {
      // Preserve the incoming order if the station is not mapped to this
      // branch/line, which can happen for legacy or partially scoped data.
      return 0;
    }

    return firstMembership.sequenceOrder - secondMembership.sequenceOrder;
  });
}

export const useAffectedStations = (
  branch: IssueAffectedBranch,
): UseAffectedStationsReturn => {
  const { lines, stations } = useIncludedEntities();
  const line = lines[branch.lineId];

  const stationsAffected = useMemo(() => {
    // Branch payloads identify the affected stations, while station memberships
    // carry the canonical sequence used to display a readable range.
    const resolvedStations = branch.stationIds
      .map((stationId) => stations[stationId])
      .filter((station): station is Station => station != null);

    return sortAffectedStationsByBranch(resolvedStations, {
      branchId: branch.branchId,
      lineId: branch.lineId,
    });
  }, [branch.branchId, branch.lineId, branch.stationIds, stations]);

  const { source, destination } = useMemo(() => {
    if (stationsAffected.length === 0) {
      return { source: null, destination: null };
    }

    if (stationsAffected.length === 1) {
      return { source: stationsAffected[0] ?? null, destination: null };
    }

    const _source = stationsAffected.at(0) ?? null;
    let _destination: Station | null = null;

    for (let i = stationsAffected.length - 1; i >= 0; i--) {
      if (stationsAffected[i]?.id !== _source?.id) {
        _destination = stationsAffected[i] ?? null;
        break;
      }
    }

    return { source: _source, destination: _destination };
  }, [stationsAffected]);

  return { line, source, destination, allStations: stationsAffected };
};
