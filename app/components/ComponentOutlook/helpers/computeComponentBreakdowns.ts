import type { Component, DateSummary, Overview } from '../../../types';

export interface ComponentBreakdown {
  component: Component;
  dates: Record<string, DateSummary>;
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
        const dateSummaryComponent = dateSummaries[dateIso] ?? {
          issueTypesDurationMs:
            dateSummary.componentIdsIssueTypesDurationMs?.[componentId] ?? {},
          issues: [],
        };
        dateSummaryComponent.issues.push(issueRef);
        dateSummaries[dateIso] = dateSummaryComponent;
        dateSummariesByComponentId[componentId] = dateSummaries;
      }
    }
  }

  return overview.components.map((component) => {
    return {
      component,
      dates: dateSummariesByComponentId[component.id] ?? {},
    };
  });
}
