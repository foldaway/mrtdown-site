import type { IncludedEntities, Issue } from '~/types';
import type { BaseIncludedEntities } from './dataset';
import type { IssueWithOperationalEffects } from './issueIntervals';

type IncludedEntitySelection = {
  issueIds?: readonly string[];
  lineIds?: readonly string[];
  operatorIds?: readonly string[];
  stationIds?: readonly string[];
  townIds?: readonly string[];
  landmarkIds?: readonly string[];
  includeIssueEntities?: boolean;
  includeLineOperators?: boolean;
  includeStationDetailEntities?: boolean;
  includeStationMembershipLines?: boolean;
};

function selectIssues(
  allIssues: Record<string, IssueWithOperationalEffects>,
  issueIds?: readonly string[],
) {
  return issueIds == null
    ? allIssues
    : Object.fromEntries(
        issueIds
          .filter((issueId) => allIssues[issueId] != null)
          .map((issueId) => [issueId, allIssues[issueId]]),
      );
}

function stripOperationalEffects(
  issues: Record<string, IssueWithOperationalEffects>,
): Record<string, Issue> {
  return Object.fromEntries(
    Object.entries(issues).map(([issueId, issue]) => {
      const {
        serviceEffectKinds: _serviceEffectKinds,
        facilityEffectKinds: _facilityEffectKinds,
        ...publicIssue
      } = issue;
      return [issueId, publicIssue];
    }),
  ) as Record<string, Issue>;
}

export function selectIncludedEntities(
  baseIncluded: BaseIncludedEntities,
  allIssues: Record<string, IssueWithOperationalEffects>,
  selection: IncludedEntitySelection,
): IncludedEntities {
  const selectedIssuesWithEffects = selectIssues(allIssues, selection.issueIds);
  const lineIds = new Set(selection.lineIds ?? []);
  const operatorIds = new Set(selection.operatorIds ?? []);
  const stationIds = new Set(selection.stationIds ?? []);
  const townIds = new Set(selection.townIds ?? []);
  const landmarkIds = new Set(selection.landmarkIds ?? []);

  if (selection.includeIssueEntities !== false) {
    for (const issue of Object.values(selectedIssuesWithEffects)) {
      for (const lineId of issue.lineIds) {
        lineIds.add(lineId);
      }
      for (const branch of issue.branchesAffected) {
        lineIds.add(branch.lineId);
        const affectedStationIds = [
          ...branch.stationIds,
          ...(branch.wholeServiceRevisions?.flatMap(
            (revision) => revision.stationIds,
          ) ?? []),
        ];
        for (const stationId of affectedStationIds) {
          stationIds.add(stationId);
        }
      }
    }
  }

  if (selection.includeStationMembershipLines === true) {
    for (const stationId of stationIds) {
      const station = baseIncluded.stations[stationId];
      for (const membership of station?.memberships ?? []) {
        lineIds.add(membership.lineId);
      }
    }
  }

  if (selection.includeLineOperators === true) {
    for (const lineId of lineIds) {
      const line = baseIncluded.lines[lineId];
      for (const operator of line?.operators ?? []) {
        operatorIds.add(operator.operatorId);
      }
    }
  }

  if (selection.includeStationDetailEntities === true) {
    for (const stationId of stationIds) {
      const station = baseIncluded.stations[stationId];
      if (station == null) {
        continue;
      }
      townIds.add(station.townId);
      for (const landmarkId of station.landmarkIds) {
        landmarkIds.add(landmarkId);
      }
    }
  }

  return {
    lines: Object.fromEntries(
      [...lineIds]
        .filter((lineId) => baseIncluded.lines[lineId] != null)
        .map((lineId) => [lineId, baseIncluded.lines[lineId]]),
    ),
    stations: Object.fromEntries(
      [...stationIds]
        .filter((stationId) => baseIncluded.stations[stationId] != null)
        .map((stationId) => [stationId, baseIncluded.stations[stationId]]),
    ),
    issues: stripOperationalEffects(selectedIssuesWithEffects),
    landmarks: Object.fromEntries(
      [...landmarkIds]
        .filter((landmarkId) => baseIncluded.landmarks[landmarkId] != null)
        .map((landmarkId) => [landmarkId, baseIncluded.landmarks[landmarkId]]),
    ),
    towns: Object.fromEntries(
      [...townIds]
        .filter((townId) => baseIncluded.towns[townId] != null)
        .map((townId) => [townId, baseIncluded.towns[townId]]),
    ),
    operators: Object.fromEntries(
      [...operatorIds]
        .filter((operatorId) => baseIncluded.operators[operatorId] != null)
        .map((operatorId) => [operatorId, baseIncluded.operators[operatorId]]),
    ),
  };
}
