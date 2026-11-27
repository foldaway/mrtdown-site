import { DateTime } from 'luxon';
import { isStationMembershipVisibleAt } from '~/helpers/isStationMembershipVisibleAt';
import type { IssueAffectedBranch, Line, Station } from '~/types';
import { selectAffectedServiceRevisionForReferenceAt } from '~/util/affectedServiceRevisions';
import {
  selectServiceRevisionForReferenceDate,
  serviceRevisionIsActiveOn,
} from '~/util/serviceRevisions';

type StationTopology = Pick<Station, 'id' | 'memberships'>;

export type ResolvedAffectedBranch = {
  branch: IssueAffectedBranch;
  stationIds: string[];
  stretchIndex: number;
  coverage: 'whole-service' | 'station-scope' | 'unknown';
  revisionId: string | null;
  isLoop: boolean | null;
};

export type AffectedArea = {
  branches: ResolvedAffectedBranch[];
  stationIds: string[];
  kind: 'service-path' | 'station-points';
};

export type AffectedLineArea = {
  lineId: string;
  wholeLine: boolean;
  areas: AffectedArea[];
  branches: ResolvedAffectedBranch[];
};

function orderedStationIds(
  branch: IssueAffectedBranch,
  stationIds: readonly string[],
  stations: Record<string, StationTopology>,
) {
  return stationIds
    .map((id, index) => ({ id, index, station: stations[id] }))
    .filter((entry) => entry.station != null)
    .sort((first, second) => {
      const order = (station: StationTopology) =>
        station.memberships.find(
          (membership) =>
            membership.lineId === branch.lineId &&
            membership.branchId === branch.branchId,
        )?.sequenceOrder;
      const firstOrder = order(first.station);
      const secondOrder = order(second.station);
      return firstOrder != null && secondOrder != null
        ? firstOrder - secondOrder
        : first.index - second.index;
    })
    .map((entry) => entry.id);
}

function resolveBranch(
  branch: IssueAffectedBranch,
  stations: Record<string, StationTopology>,
  referenceAt: string,
  serviceIsLoop: boolean | null,
): ResolvedAffectedBranch[] {
  const selectedRevision =
    branch.wholeServiceRevisions != null
      ? selectAffectedServiceRevisionForReferenceAt(
          branch.wholeServiceRevisions,
          referenceAt,
        )
      : undefined;
  const referenceDate = DateTime.fromISO(referenceAt, { setZone: true })
    .setZone('Asia/Singapore')
    .toISODate();
  const revision =
    selectedRevision != null &&
    referenceDate != null &&
    serviceRevisionIsActiveOn(
      { start_at: selectedRevision.startAt, end_at: selectedRevision.endAt },
      referenceDate,
    )
      ? selectedRevision
      : undefined;
  const stretches =
    revision != null
      ? [revision.stationIds]
      : branch.wholeServiceRevisions != null
        ? [[]]
        : branch.stationStretches?.length === 0
          ? [[]]
          : (branch.stationStretches ?? [branch.stationIds]);

  return stretches.map((sourceIds, stretchIndex) => {
    const stationIds =
      revision != null
        ? sourceIds.filter((id) => stations[id] != null)
        : branch.stationStretches != null
          ? sourceIds.filter((id) => stations[id] != null)
          : orderedStationIds(branch, sourceIds, stations);
    const complete =
      sourceIds.length > 0 && stationIds.length === sourceIds.length;
    return {
      branch,
      stationIds,
      stretchIndex,
      coverage: !complete
        ? 'unknown'
        : revision != null
          ? 'whole-service'
          : 'station-scope',
      revisionId: revision?.id ?? null,
      isLoop: revision?.isLoop ?? serviceIsLoop,
    };
  });
}

function activeLineServices(line: Line | undefined, referenceAt: string) {
  if (line?.serviceCoverage == null) return null;
  if (line.serviceCoverage.some((service) => service.revisions.length === 0)) {
    return null;
  }
  const referenceDate = DateTime.fromISO(referenceAt, { setZone: true })
    .setZone('Asia/Singapore')
    .toISODate();
  if (referenceDate == null) return null;

  return line.serviceCoverage.flatMap((service) => {
    const revision = selectServiceRevisionForReferenceDate(
      service.revisions.map((candidate) => ({
        id: candidate.id,
        start_at: candidate.startAt,
        end_at: candidate.endAt,
        updated_at: candidate.updatedAt,
        isLoop: candidate.isLoop,
      })),
      referenceDate,
    );
    return revision == null ||
      !serviceRevisionIsActiveOn(revision, referenceDate)
      ? []
      : [
          {
            id: service.id,
            revisionId: revision.id,
            isLoop: revision.isLoop ?? null,
          },
        ];
  });
}

function areaKey(branch: ResolvedAffectedBranch) {
  if (branch.stationIds.length === 0) {
    return `unpaired:${branch.branch.branchId}:${branch.stretchIndex}`;
  }
  const forward = branch.stationIds.join('\u0000');
  const reverse = [...branch.stationIds].reverse().join('\u0000');
  return forward < reverse ? forward : reverse;
}

function isFacilityPoint(branch: ResolvedAffectedBranch) {
  return (
    branch.branch.serviceName == null &&
    branch.stationIds.length === 1 &&
    branch.branch.branchId === `${branch.branch.lineId}:${branch.stationIds[0]}`
  );
}

function adjacentStations(
  firstId: string,
  secondId: string,
  lineId: string,
  stations: Record<string, StationTopology>,
  referenceAt: string,
) {
  const first = stations[firstId];
  const second = stations[secondId];
  if (first == null || second == null) return false;
  return first.memberships.some(
    (membership) =>
      membership.lineId === lineId &&
      isStationMembershipVisibleAt(membership, referenceAt) &&
      second.memberships.some(
        (other) =>
          other.lineId === lineId &&
          other.branchId === membership.branchId &&
          isStationMembershipVisibleAt(other, referenceAt) &&
          Math.abs(other.sequenceOrder - membership.sequenceOrder) === 1,
      ),
  );
}

function mergeAdjacentFacilityPoints(
  areas: AffectedArea[],
  lineId: string,
  stations: Record<string, StationTopology>,
  referenceAt: string,
) {
  const pointAreas = areas.filter(
    (area) =>
      area.kind === 'station-points' &&
      area.stationIds.length === 1 &&
      area.branches.every(isFacilityPoint),
  );
  const consumed = new Set<AffectedArea>();
  const merged: AffectedArea[] = [];
  for (const area of areas) {
    if (consumed.has(area)) continue;
    if (!pointAreas.includes(area)) {
      merged.push(area);
      continue;
    }
    const cluster = [area];
    consumed.add(area);
    for (let index = 0; index < cluster.length; index++) {
      for (const candidate of pointAreas) {
        if (
          !consumed.has(candidate) &&
          adjacentStations(
            cluster[index].stationIds[0],
            candidate.stationIds[0],
            lineId,
            stations,
            referenceAt,
          )
        ) {
          consumed.add(candidate);
          cluster.push(candidate);
        }
      }
    }
    const ordered = [cluster[0]];
    if (cluster.length > 2) {
      const endpoint = cluster.find(
        (candidate) =>
          cluster.filter(
            (other) =>
              other !== candidate &&
              adjacentStations(
                candidate.stationIds[0],
                other.stationIds[0],
                lineId,
                stations,
                referenceAt,
              ),
          ).length === 1,
      );
      if (endpoint != null) ordered[0] = endpoint;
    }
    while (ordered.length < cluster.length) {
      const next = cluster.find(
        (candidate) =>
          !ordered.includes(candidate) &&
          adjacentStations(
            ordered.at(-1)?.stationIds[0] ?? '',
            candidate.stationIds[0],
            lineId,
            stations,
            referenceAt,
          ),
      );
      if (next == null) break;
      ordered.push(next);
    }
    if (ordered.length !== cluster.length) {
      merged.push(...cluster);
      continue;
    }
    merged.push({
      kind: 'station-points',
      stationIds: ordered.map((point) => point.stationIds[0]),
      branches: ordered.flatMap((point) => point.branches),
    });
  }
  return merged;
}

export function getAffectedLineAreas(
  branches: readonly IssueAffectedBranch[],
  lines: Record<string, Line>,
  stations: Record<string, StationTopology>,
  referenceAt: string,
): AffectedLineArea[] {
  const byLine = new Map<string, ResolvedAffectedBranch[]>();
  const activeByLine = new Map<string, ReturnType<typeof activeLineServices>>();
  for (const branch of branches) {
    if (!activeByLine.has(branch.lineId)) {
      activeByLine.set(
        branch.lineId,
        activeLineServices(lines[branch.lineId], referenceAt),
      );
    }
    const service = activeByLine
      .get(branch.lineId)
      ?.find((candidate) => candidate.id === branch.branchId);
    const resolved = resolveBranch(
      branch,
      stations,
      referenceAt,
      service?.isLoop ?? null,
    );
    const lineBranches = byLine.get(branch.lineId) ?? [];
    lineBranches.push(...resolved);
    byLine.set(branch.lineId, lineBranches);
  }

  return [...byLine].map(([lineId, lineBranches]) => {
    const activeServices = activeByLine.get(lineId);
    const wholeLine =
      activeServices != null &&
      activeServices.length > 0 &&
      activeServices.every((service) =>
        lineBranches.some(
          ({ branch, coverage, revisionId }) =>
            branch.branchId === service.id &&
            coverage === 'whole-service' &&
            revisionId === service.revisionId,
        ),
      );
    const areasByKey = new Map<string, AffectedArea>();
    for (const branch of lineBranches) {
      const key = areaKey(branch);
      const area = areasByKey.get(key) ?? {
        branches: [],
        stationIds: branch.stationIds,
        kind: isFacilityPoint(branch) ? 'station-points' : 'service-path',
      };
      area.branches.push(branch);
      if (!isFacilityPoint(branch)) area.kind = 'service-path';
      areasByKey.set(key, area);
    }
    return {
      lineId,
      wholeLine,
      areas: mergeAdjacentFacilityPoints(
        [...areasByKey.values()],
        lineId,
        stations,
        referenceAt,
      ),
      branches: lineBranches,
    };
  });
}
