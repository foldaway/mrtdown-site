import { DateTime } from 'luxon';
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
      const startAt = DateTime.fromISO(issueRef.startAt);
      const endAt =
        issueRef.endAt != null
          ? DateTime.fromISO(issueRef.endAt)
          : startAt.endOf('day');
      const durationMs = endAt.diff(startAt).as('milliseconds');

      for (const componentId of issueRef.componentIdsAffected) {
        const dateSummaries = dateSummariesByComponentId[componentId] ?? {};
        const dateSummary = dateSummaries[dateIso] ?? {
          issueTypesDurationMs: {},
          issues: [],
        };
        let issueTypeDurationMs =
          dateSummary.issueTypesDurationMs[issueRef.type] ?? 0;
        issueTypeDurationMs += durationMs;
        dateSummary.issueTypesDurationMs[issueRef.type] = issueTypeDurationMs;
        dateSummary.issues.push(issueRef);
        dateSummaries[dateIso] = dateSummary;
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
