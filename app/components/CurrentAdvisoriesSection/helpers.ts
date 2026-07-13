import type { AdvisorySummaryBucket, Issue, LineSummary } from '~/types';

type AdvisoryLineSummary = Pick<LineSummary, 'lineId' | 'status'>;

export function countOperationalLineSummaries({
  lineSummaries,
}: {
  lineSummaries: AdvisoryLineSummary[];
}) {
  return lineSummaries.filter((lineSummary) => lineSummary.status === 'normal')
    .length;
}

type AdvisoryBucketIssueIds = Pick<AdvisorySummaryBucket, 'issueIds'>;
type AdvisoryIssueLines = Pick<Issue, 'lineIds'>;

export function collectAdvisoryLineIds({
  buckets,
  issuesById,
}: {
  buckets: AdvisoryBucketIssueIds[];
  issuesById: Partial<Record<string, AdvisoryIssueLines>>;
}) {
  return [
    ...new Set(
      buckets.flatMap((bucket) =>
        bucket.issueIds.flatMap(
          (issueId) => issuesById[issueId]?.lineIds ?? [],
        ),
      ),
    ),
  ].sort();
}
