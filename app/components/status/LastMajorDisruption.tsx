import { ClockIcon } from '@heroicons/react/24/outline';
import { DateTime, Duration, Interval } from 'luxon';
import type React from 'react';
import { useMemo } from 'react';
import { FormattedMessage, FormattedRelativeTime, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { calculateDurationWithinServiceHours } from '~/helpers/calculateDurationWithinServiceHours';
import { computeIssueIntervals } from '~/helpers/computeIssueIntervals';
import { useHydrated } from '~/hooks/useHydrated';
import type { IssueRef } from '~/types';
import { assert } from '~/util/assert';
import { FormattedDuration } from '../FormattedDuration';

interface Props {
  issueRef: IssueRef | null;
}

export const LastMajorDisruption: React.FC<Props> = (props) => {
  const { issueRef } = props;

  const isHydrated = useHydrated();
  const intl = useIntl();

  const durationWithinServiceHours = useMemo(() => {
    if (issueRef == null) {
      return Duration.fromMillis(0);
    }

    const intervals = computeIssueIntervals(issueRef);

    if (intervals.length === 0) {
      return Duration.fromMillis(0);
    }

    const intervalFirst = intervals[0];
    const intervalLast = intervals[intervals.length - 1];

    assert(intervalFirst.start != null);
    assert(intervalLast.end != null);

    const intervalOverall = Interval.fromDateTimes(
      intervalFirst.start,
      intervalLast.end,
    );
    assert(intervalOverall.isValid);

    let _durationWithinServiceHours = Duration.fromMillis(0);
    for (const interval of intervals) {
      assert(interval.isValid);
      assert(interval.start != null && interval.end != null);
      _durationWithinServiceHours = _durationWithinServiceHours.plus(
        calculateDurationWithinServiceHours(interval.start, interval.end),
      );
    }

    return _durationWithinServiceHours;
  }, [issueRef]);

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-gray-300 bg-white py-2 py-4 dark:border-gray-700 dark:bg-gray-800">
      <ClockIcon className="size-10 text-disruption-light dark:text-disruption-dark" />

      <span className="font-bold text-gray-700 text-xl dark:text-gray-100">
        <FormattedMessage
          id="general.component_status.last_major_disruption"
          defaultMessage="Last Major Disruption"
        />
      </span>

      <span className="text-gray-500 text-sm dark:text-gray-400">
        {issueRef != null ? (
          <>
            {issueRef.endAt == null && (
              <FormattedMessage id="general.ongoing" defaultMessage="Ongoing" />
            )}
            {issueRef.endAt != null &&
              (isHydrated ? (
                <FormattedRelativeTime
                  value={Math.round(
                    DateTime.fromISO(issueRef.endAt).diffNow('days').days,
                  )}
                  unit="day"
                  numeric="auto"
                />
              ) : (
                issueRef.endAt
              ))}
          </>
        ) : (
          'N/A'
        )}
      </span>

      {issueRef != null && (
        <Link to={buildLocaleAwareLink(`/issues/${issueRef.id}`, intl.locale)}>
          <span className="rounded-lg bg-gray-200 px-2 py-0.5 text-xs dark:bg-gray-700">
            <FormattedMessage
              id="general.uptime_duration_display"
              defaultMessage="{duration} within service hours"
              values={{
                duration: (
                  <FormattedDuration duration={durationWithinServiceHours} />
                ),
              }}
            />
          </span>
        </Link>
      )}
    </div>
  );
};
