import { DateTime } from 'luxon';
import { FormattedMessage, useIntl } from 'react-intl';
import type { IncludedEntities, Issue } from '~/client';
import { IssueCard } from '~/components/IssueCard';
import Spinner from '~/components/Spinner';

interface Props {
  dateString: string;
  issues: Issue[];
  included: IncludedEntities | null;
  isLoading: boolean;
  error: Error | null;
}

export const DayIssuesList: React.FC<Props> = (props) => {
  const { dateString, issues, included, isLoading, error } = props;
  const intl = useIntl();

  const date = DateTime.fromISO(dateString);
  const formattedDate = intl.formatDate(date.toJSDate(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="col-span-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-4">
        <h3 className="font-semibold text-base text-gray-900 dark:text-white">
          <FormattedMessage
            id="general.disruptions_on_day"
            defaultMessage="Disruptions on {date}"
            values={{ date: formattedDate }}
          />
        </h3>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner size="medium" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <p className="text-red-700 text-sm dark:text-red-300">
            <FormattedMessage
              id="general.error_loading_issues"
              defaultMessage="Error loading issues"
            />
          </p>
        </div>
      )}

      {!isLoading && !error && issues.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-gray-600 text-sm dark:text-gray-400">
            <FormattedMessage
              id="general.no_issues_on_day"
              defaultMessage="No issues recorded on this day"
            />
          </p>
        </div>
      )}

      {!isLoading && !error && issues.length > 0 && included && (
        <div className="flex flex-col gap-3">
          {issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              context={{
                type: 'history.days',
                date: dateString,
                days: 1,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
