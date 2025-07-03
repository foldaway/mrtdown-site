import type {
  Component,
  DateSummary,
  IssueRef,
  Overview,
} from '../../../types';

export interface ComponentBreakdown {
  component: Component;
  dates: Record<string, DateSummary>;
  issuesOngoing: IssueRef[];
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

  const issuesOngoingByComponentId: Record<string, IssueRef[]> = {};
  for (const issue of overview.issuesOngoingSnapshot) {
    for (const componentId of issue.componentIdsAffected) {
      const _issues = issuesOngoingByComponentId[componentId] ?? [];
      _issues.push(issue);
      issuesOngoingByComponentId[componentId] = _issues;
    }
  }

  return overview.components.map((component) => {
    return {
      component,
      dates: dateSummariesByComponentId[component.id] ?? {},
      issuesOngoing: issuesOngoingByComponentId[component.id] ?? [],
    };
  });
}
