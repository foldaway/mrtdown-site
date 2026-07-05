import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { IssueCard } from '~/components/IssueCard';
import type { AdvisorySummary, AdvisorySummaryBucketId, Issue } from '~/types';
import type { IssueCardContext } from '../IssueCard/types';

const ISSUE_CARD_CONTEXT_NOW: IssueCardContext = {
  type: 'now',
};

interface Props {
  advisorySummary: AdvisorySummary;
  bucketId: AdvisorySummaryBucketId;
  issueIds: string[];
  issuesById: Record<string, Issue>;
}

export function CurrentAdvisoriesBucketDetails(props: Props) {
  const { advisorySummary, bucketId, issueIds, issuesById } = props;

  const issueCardContextToday = useMemo<IssueCardContext>(() => {
    const windowStartDate =
      DateTime.fromISO(advisorySummary.windowStart).toISODate() ??
      DateTime.now().toISODate();
    return {
      type: 'history.days',
      date: windowStartDate,
      days: 1,
    };
  }, [advisorySummary.windowStart]);

  const issueCardContextWeek = useMemo<IssueCardContext>(() => {
    const windowStartDate =
      DateTime.fromISO(advisorySummary.windowStart).toISODate() ??
      DateTime.now().toISODate();
    return {
      type: 'history.days',
      date: windowStartDate,
      days: 7,
    };
  }, [advisorySummary.windowStart]);

  const context = getIssueCardContext({
    bucketId,
    issueCardContextToday,
    issueCardContextWeek,
  });
  const issues = issueIds
    .map((issueId) => issuesById[issueId])
    .filter((issue): issue is Issue => issue != null);

  return (
    <div className="flex flex-col gap-2">
      {issues.map((issue) => (
        <IssueCard
          key={`${bucketId}-${issue.id}`}
          issue={issue}
          className="!w-auto"
          context={context}
        />
      ))}
    </div>
  );
}

function getIssueCardContext({
  bucketId,
  issueCardContextToday,
  issueCardContextWeek,
}: {
  bucketId: AdvisorySummaryBucketId;
  issueCardContextToday: IssueCardContext;
  issueCardContextWeek: IssueCardContext;
}) {
  switch (bucketId) {
    case 'now':
      return ISSUE_CARD_CONTEXT_NOW;
    case 'later_today':
      return issueCardContextToday;
    case 'this_week':
    case 'background':
      return issueCardContextWeek;
  }
}
