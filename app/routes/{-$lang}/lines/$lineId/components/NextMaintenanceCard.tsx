import { Link } from '@tanstack/react-router';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { FormattedDateTimeRange, FormattedMessage, useIntl } from 'react-intl';
import type { Issue } from '~/types';
import { IssueAffectedBranchPill } from '~/components/IssueAffectedBranchPill';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';

interface InternalContentProps {
  lineId: string;
  issue: Issue;
}

const InternalContent: React.FC<InternalContentProps> = (props) => {
  const { issue } = props;

  const intl = useIntl();
  const interval = useMemo(() => {
    return (
      issue.intervals.sort((a, b) => {
        switch (a.status) {
          case 'ongoing':
          case 'future': {
            return -1;
          }
        }

        switch (b.status) {
          case 'ongoing':
          case 'future': {
            return 1;
          }
        }

        return 0;
      })?.[0] ?? null
    );
  }, [issue.intervals]);

  return (
    <>
      <Link
        className="hover:underline"
        to="/{-$lang}/issues/$issueId"
        params={{ issueId: issue.id }}
      >
        <span className="font-medium text-gray-800 text-sm leading-5 dark:text-gray-200">
          {getLocalizedTranslation(issue.title, intl.locale)}
        </span>
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {issue.branchesAffected.map((branch) => (
          <IssueAffectedBranchPill
            key={`${branch.branchId}@${branch.lineId}`}
            branch={branch}
            issue={issue}
            interval={interval ?? undefined}
          />
        ))}
      </div>

      <span className="mt-2 text-gray-400 text-xs">
        {interval != null ? (
          interval.endAt != null ? (
            <FormattedDateTimeRange
              timeStyle="short"
              dateStyle="medium"
              from={DateTime.fromISO(interval.startAt).toMillis()}
              to={DateTime.fromISO(interval.endAt).toMillis()}
            />
          ) : (
            <FormattedMessage
              id="general.ongoing_timestamp"
              defaultMessage="{start, date, medium} {start, time, short} to present"
              values={{
                start: interval.startAt,
              }}
            />
          )
        ) : (
          <p>Unknown Interval</p>
        )}
      </span>
    </>
  );
};

interface Props {
  lineId: string;
  issueId: string | null;
}

export const NextMaintenanceCard: React.FC<Props> = (props) => {
  const { issueId, lineId } = props;

  const { issues } = useIncludedEntities();
  const issue = useMemo(() => {
    if (issueId == null) {
      return null;
    }
    return issues[issueId];
  }, [issueId, issues]);

  return (
    <div className="flex flex-col px-4 py-3 text-gray-800 sm:px-5 sm:py-4 dark:text-gray-200">
      <h2 className="font-semibold text-gray-900 text-sm leading-5 dark:text-gray-100">
        <FormattedMessage
          id="general.next_maintenance"
          defaultMessage="Next Maintenance"
        />
      </h2>
      {issue != null ? (
        <div className="mt-2 flex flex-col">
          <InternalContent issue={issue} lineId={lineId} />
        </div>
      ) : (
        <p className="mt-2 text-gray-500 text-xs leading-4 dark:text-gray-400">
          <FormattedMessage
            id="general.no_scheduled_maintenance"
            defaultMessage="There is no scheduled maintenance for this line."
          />
        </p>
      )}
    </div>
  );
};
