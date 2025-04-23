import type { Component, DateSummary, Overview } from '../../../types';

export interface ComponentBreakdown {
  component: Component;
  dates: Record<string, DateSummary>;
  issuesOngoingCount: number;
}

export function computeComponentBreakdown(
  overview: Overview,
): ComponentBreakdown[] {
  const dateSummariesByComponentId: Record<
    string,
    Record<string, DateSummary>
  > = {};

  for (const [dateIso, dateSummary] of Object.entries(overview.dates)) {
    for (const issueRef of dateSummary.issues) {
      for (const componentId of issueRef.componentIdsAffected) {
        const dateSummaries = dateSummariesByComponentId[componentId] ?? {};
        const dateSummaryComponent =
          dateSummaries[dateIso] ??
          ({
            issueTypesDurationMs:
              dateSummary.componentIdsIssueTypesDurationMs?.[componentId] ?? {},
            issueTypesIntervalsNoOverlapMs:
              dateSummary.componentIdsIssueTypesIntervalsNoOverlapMs?.[
                componentId
              ] ?? {},
            componentIdsIssueTypesIntervalsNoOverlapMs:
              dateSummary.componentIdsIssueTypesIntervalsNoOverlapMs ?? {},
            componentIdsIssueTypesDurationMs:
              dateSummary.componentIdsIssueTypesDurationMs ?? {},
            issues: [],
          } satisfies DateSummary);
        dateSummaryComponent.issues.push(issueRef);
        dateSummaries[dateIso] = dateSummaryComponent;
        dateSummariesByComponentId[componentId] = dateSummaries;
      }
    }
  }

  const issuesOngoingCountByComponentId: Record<string, number> = {};
  for (const issue of overview.issuesOngoing) {
    for (const componentId of issue.componentIdsAffected) {
      let count = issuesOngoingCountByComponentId[componentId] ?? 0;
      count++;
      issuesOngoingCountByComponentId[componentId] = count;
    }
  }

  return overview.components.map((component) => {
    return {
      component,
      dates: dateSummariesByComponentId[component.id] ?? {},
      issuesOngoingCount: issuesOngoingCountByComponentId[component.id] ?? 0,
    };
  });
}
