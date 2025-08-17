import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { FormattedDateTimeRange, FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import type { Issue } from '~/client';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { IssueAffectedBranchPill } from '../../../components/IssueAffectedBranchPill';

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
        to={buildLocaleAwareLink(`/issues/${issue.id}`, intl.locale)}
      >
        <span className="font-semibold text-base text-gray-800 leading-tight dark:text-gray-200">
          {issue.titleTranslations[intl.locale] ?? issue.title}
        </span>
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {issue.branchesAffected.map((branch) => (
          <IssueAffectedBranchPill
            key={`${branch.branchId}@${branch.lineId}`}
            branch={branch}
          />
        ))}
      </div>

      <span className="mt-2 text-gray-400 text-xs">
        {interval != null ? (
          <>
            {interval.endAt != null ? (
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
            )}
          </>
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
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 text-gray-800 shadow-lg md:col-span-5 dark:border-gray-700 dark:text-gray-200">
      <h3 className="mb-2 font-semibold text-base text-gray-900 dark:text-white">
        <FormattedMessage
          id="general.next_maintenance"
          defaultMessage="Next Maintenance"
        />
      </h3>
      {issue != null ? (
        <InternalContent issue={issue} lineId={lineId} />
      ) : (
        <p className="text-gray-500 text-sm">
          <FormattedMessage
            id="general.no_scheduled_maintenance"
            defaultMessage="There is no scheduled maintenance for this line."
          />
        </p>
      )}
    </div>
  );
};
