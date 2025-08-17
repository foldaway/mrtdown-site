import { useMemo } from 'react';
import type { IssueAffectedBranch, Line, Station } from '~/client';
import { useIncludedEntities } from '~/contexts/IncludedEntities';

interface UseAffectedStationsReturn {
  line: Line;
  source: Station | null;
  destination: Station | null;
  allStations: Station[];
}

export const useAffectedStations = (
  branch: IssueAffectedBranch,
): UseAffectedStationsReturn => {
  const { lines, stations } = useIncludedEntities();
  const line = lines[branch.lineId];

  const stationsAffected = useMemo(() => {
    return branch.stationIds.map((stationId) => stations[stationId]);
  }, [branch.stationIds, stations]);

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
