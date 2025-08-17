import { Duration } from 'luxon';
import { useMemo } from 'react';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import type { Issue } from '~/client';
import { ComponentBar } from '~/components/ComponentBar';
import { FormattedDuration } from '~/components/FormattedDuration';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useHydrated } from '../../../../../hooks/useHydrated';

interface Props {
  issue: Issue;
}

export const Item: React.FC<Props> = (props) => {
  const { issue } = props;

  const intl = useIntl();
  const isHydrated = useHydrated();
  const includedEntities = useIncludedEntities();

  const duration = useMemo(() => {
    return Duration.fromMillis(issue.durationSeconds * 1000);
  }, [issue.durationSeconds]);

  const lines = useMemo(() => {
    return issue.lineIds.map((lineId) => includedEntities.lines[lineId]);
  }, [issue.lineIds, includedEntities.lines]);

  return (
    <div className="flex flex-col py-1">
      <Link
        className="hover:underline"
        to={buildLocaleAwareLink(`/issues/${issue.id}`, intl.locale)}
      >
        <span className="line-clamp-1 text-gray-700 text-sm dark:text-gray-200">
          {issue.titleTranslations[intl.locale] ?? issue.title}
        </span>
      </Link>
      <time className="mt-0.5 mb-1.5 text-gray-400 text-xs dark:text-gray-500">
        {isHydrated ? (
          <FormattedDate
            value={issue.intervals[0].startAt}
            month="short"
            day="numeric"
            year="numeric"
            hour="numeric"
            minute="numeric"
          />
        ) : (
          issue.intervals[0].startAt
        )}
        <br />
        {isHydrated ? (
          <FormattedMessage
            id="general.uptime_duration_display"
            defaultMessage="{duration} within service hours"
            values={{
              duration: (
                <FormattedDuration
                  duration={duration
                    .rescale()
                    .set({ seconds: 0, milliseconds: 0 })
                    .rescale()}
                />
              ),
            }}
          />
        ) : (
          duration.toISO()
        )}
      </time>
      <div className="flex items-center">
        <ComponentBar components={lines} />
      </div>
    </div>
  );
};
