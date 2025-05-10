import type { Issue } from '~/types';

export function countIssueStations(issue: Issue): number {
  const result = new Set<string>();
  for (const entry of issue.stationIdsAffected) {
    for (const stationId of entry.stationIds) {
      result.add(stationId);
    }
  }
  return result.size;
}
