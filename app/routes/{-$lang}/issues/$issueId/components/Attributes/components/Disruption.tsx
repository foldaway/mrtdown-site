import { Duration } from 'luxon';
import { FormattedDate, FormattedMessage } from 'react-intl';
import type { Issue } from '~/types';
import { FormattedDuration } from '~/components/FormattedDuration';

interface Props {
  issue: Issue;
}

export const Disruption: React.FC<Props> = (props) => {
  const { issue } = props;
  const { intervals } = issue;

  return (
    <>
      <div>
        <dt className="font-medium text-[11px] text-gray-500 uppercase tracking-wide dark:text-gray-400">
          <FormattedMessage id="general.started" defaultMessage="Started" />
        </dt>
        <dd className="mt-0.5 font-medium text-gray-800 text-sm leading-5 dark:text-gray-200">
          <FormattedDate
            value={intervals[0].startAt}
            dateStyle="medium"
            timeStyle="short"
          />
        </dd>
      </div>

      <div>
        <dt className="font-medium text-[11px] text-gray-500 uppercase tracking-wide dark:text-gray-400">
          <FormattedMessage id="general.resolved" defaultMessage="Resolved" />
        </dt>
        <dd className="mt-0.5 font-medium text-gray-800 text-sm leading-5 dark:text-gray-200">
          {intervals[0].endAt != null ? (
            <FormattedDate
              value={intervals[0].endAt}
              dateStyle="medium"
              timeStyle="short"
            />
          ) : (
            <FormattedMessage id="general.ongoing" defaultMessage="Ongoing" />
          )}
        </dd>
      </div>

      <div>
        <dt className="font-medium text-[11px] text-gray-500 uppercase tracking-wide dark:text-gray-400">
          <FormattedMessage id="general.duration" defaultMessage="Duration" />
        </dt>
        <dd className="mt-0.5 font-medium text-gray-800 text-sm leading-5 dark:text-gray-200">
          <FormattedDuration
            duration={Duration.fromObject({
              seconds: issue.durationSeconds,
            })}
          />
        </dd>
      </div>
    </>
  );
};
