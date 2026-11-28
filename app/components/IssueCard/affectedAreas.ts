import { isStationMembershipVisibleAt } from '~/helpers/isStationMembershipVisibleAt';
import type { IssueAffectedBranch, Station } from '~/types';
import { selectAffectedServiceRevisionForReferenceAt } from '~/util/affectedServiceRevisions';
import { serviceRevisionIsActiveOn } from '~/util/serviceRevisions';

type StationTopology = Pick<Station, 'id' | 'memberships'>;

export type ResolvedAffectedBranch = {
  branch: IssueAffectedBranch;
  stationIds: string[];
  stretchIndex: number;
  coverage: 'whole-service' | 'station-scope' | 'unknown';
  isLoop: boolean;
};

export type AffectedArea = {
  branches: ResolvedAffectedBranch[];
  stationIds: string[];
  kind: 'service-path' | 'station-points';
};

export type AffectedLineArea = { lineId: string; areas: AffectedArea[] };

function resolveBranch(
  branch: IssueAffectedBranch,
  stations: Record<string, StationTopology>,
  referenceAt: string,
): ResolvedAffectedBranch[] {
  const revision =
    branch.wholeServiceRevisions == null
      ? undefined
      : selectAffectedServiceRevisionForReferenceAt(
          branch.wholeServiceRevisions,
          referenceAt,
        );
  const activeRevision =
    revision != null &&
    serviceRevisionIsActiveOn(
      { start_at: revision.startAt, end_at: revision.endAt },
      referenceAt.slice(0, 10),
    )
      ? revision
      : undefined;
  const stretches =
    activeRevision != null
      ? [activeRevision.stationIds]
      : branch.wholeServiceRevisions != null
        ? [[]]
        : (branch.stationStretches ?? [branch.stationIds]);

  return stretches.map((sourceIds, stretchIndex) => {
    const stationIds = sourceIds.filter((id) => stations[id] != null);
    const complete =
      sourceIds.length > 0 && stationIds.length === sourceIds.length;
    return {
      branch,
      stationIds,
      stretchIndex,
      coverage: !complete
        ? 'unknown'
        : activeRevision != null
          ? 'whole-service'
          : 'station-scope',
      isLoop: branch.isLoop ?? activeRevision?.isLoop ?? false,
    };
  });
}

function isFacilityPoint(branch: ResolvedAffectedBranch) {
  return (
    branch.branch.serviceName == null &&
    branch.stationIds.length === 1 &&
    branch.branch.branchId === `${branch.branch.lineId}:${branch.stationIds[0]}`
  );
}

function adjacent(
  firstId: string,
  secondId: string,
  lineId: string,
  stations: Record<string, StationTopology>,
  referenceAt: string,
) {
  return (stations[firstId]?.memberships ?? []).some(
    (first) =>
      first.lineId === lineId &&
      isStationMembershipVisibleAt(first, referenceAt) &&
      (stations[secondId]?.memberships ?? []).some(
        (second) =>
          second.lineId === lineId &&
          second.branchId === first.branchId &&
          isStationMembershipVisibleAt(second, referenceAt) &&
          Math.abs(second.sequenceOrder - first.sequenceOrder) === 1,
      ),
  );
}

function mergeFacilityPoints(
  areas: AffectedArea[],
  lineId: string,
  stations: Record<string, StationTopology>,
  referenceAt: string,
) {
  const points = areas.filter((area) => area.kind === 'station-points');
  if (points.length < 2) return areas;
  points.sort((a, b) => {
    const order = (area: AffectedArea) =>
      stations[area.stationIds[0]]?.memberships.find(
        (membership) => membership.lineId === lineId,
      )?.sequenceOrder ?? 0;
    return order(a) - order(b);
  });
  const merged: AffectedArea[] = [];
  for (const point of points) {
    const last = merged.at(-1);
    if (
      last != null &&
      adjacent(
        last.stationIds.at(-1) ?? '',
        point.stationIds[0],
        lineId,
        stations,
        referenceAt,
      )
    ) {
      last.stationIds.push(...point.stationIds);
      last.branches.push(...point.branches);
    } else {
      merged.push({ ...point, stationIds: [...point.stationIds] });
    }
  }
  return [...areas.filter((area) => area.kind !== 'station-points'), ...merged];
}

export function getAffectedLineAreas(
  branches: readonly IssueAffectedBranch[],
  stations: Record<string, StationTopology>,
  referenceAt: string,
): AffectedLineArea[] {
  const byLine = new Map<string, AffectedArea[]>();
  for (const branch of branches) {
    const areas = byLine.get(branch.lineId) ?? [];
    for (const resolved of resolveBranch(branch, stations, referenceAt)) {
      const stationIds = resolved.stationIds;
      const key = stationIds.join('|');
      const reverse = [...stationIds].reverse().join('|');
      const match =
        stationIds.length > 0
          ? areas.find(
              (area) =>
                area.kind === 'service-path' &&
                (area.stationIds.join('|') === key ||
                  area.stationIds.join('|') === reverse),
            )
          : undefined;
      if (match != null) {
        match.branches.push(resolved);
      } else {
        areas.push({
          branches: [resolved],
          stationIds,
          kind: isFacilityPoint(resolved) ? 'station-points' : 'service-path',
        });
      }
    }
    byLine.set(branch.lineId, areas);
  }
  return [...byLine].map(([lineId, areas]) => ({
    lineId,
    areas: mergeFacilityPoints(areas, lineId, stations, referenceAt),
  }));
}
