import type { Issue, LineSummary } from '~/types';

type AdvisoryIssue = Pick<Issue, 'lineIds'>;
type AdvisoryLineSummary = Pick<LineSummary, 'lineId' | 'status'>;

export function countOperationalLinesOutsideCurrentAdvisories({
  issuesActiveNow,
  issuesActiveToday,
  lineSummaries,
}: {
  issuesActiveNow: AdvisoryIssue[];
  issuesActiveToday: AdvisoryIssue[];
  lineSummaries: AdvisoryLineSummary[];
}) {
  const advisoryLineIds = new Set(
    [...issuesActiveNow, ...issuesActiveToday].flatMap(
      (issue) => issue.lineIds,
    ),
  );

  return lineSummaries.filter(
    (lineSummary) =>
      lineSummary.status === 'normal' &&
      !advisoryLineIds.has(lineSummary.lineId),
  ).length;
}
