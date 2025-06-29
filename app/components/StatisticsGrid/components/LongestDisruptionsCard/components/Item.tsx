import { DateTime, Interval } from 'luxon';
import { useMemo } from 'react';
import { FormattedDateTimeRange, FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { FormattedDuration } from '~/components/FormattedDuration';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { calculateDurationWithinServiceHours } from '../../../../../helpers/calculateDurationWithinServiceHours';
import { useHydrated } from '../../../../../hooks/useHydrated';
import type { IssueRef } from '../../../../../types';
import { assert } from '../../../../../util/assert';
import { ComponentBar } from '../../../../ComponentBar';

interface Props {
  issueRef: IssueRef;
}

export const Item: React.FC<Props> = (props) => {
  const { issueRef } = props;

  const intl = useIntl();

  const startAt = useMemo(() => {
    const dateTime = DateTime.fromISO(issueRef.startAt).setZone(
      'Asia/Singapore',
    );
    assert(dateTime.isValid);
    return dateTime;
  }, [issueRef.startAt]);

  const endAt = useMemo(() => {
    assert(issueRef.endAt != null);
    const dateTime = DateTime.fromISO(issueRef.endAt).setZone('Asia/Singapore');
    assert(dateTime.isValid);
    return dateTime;
  }, [issueRef.endAt]);

  const interval = useMemo(
    () => Interval.fromDateTimes(startAt, endAt),
    [startAt, endAt],
  );
  const isHydrated = useHydrated();

  const durationWithinServiceHours = useMemo(() => {
    return calculateDurationWithinServiceHours(startAt, endAt);
  }, [startAt, endAt]);

  return (
    <div className="flex flex-col py-1">
      <Link
        className="hover:underline"
        to={buildLocaleAwareLink(`/issues/${issueRef.id}`, intl.locale)}
      >
        <span className="line-clamp-1 text-gray-700 text-sm dark:text-gray-200">
          {issueRef.title_translations[intl.locale] ?? issueRef.title}
        </span>
      </Link>
      <time className="mt-0.5 mb-1.5 text-gray-400 text-xs dark:text-gray-500">
        {isHydrated ? (
          <FormattedDateTimeRange
            from={startAt.toJSDate()}
            to={endAt.toJSDate()}
            month="short"
            day="numeric"
            year="numeric"
            hour="numeric"
            minute="numeric"
          />
        ) : (
          interval.toISO()
        )}
        <br />
        {isHydrated ? (
          <FormattedMessage
            id="general.uptime_duration_display"
            defaultMessage="{duration} within service hours"
            values={{
              duration: (
                <FormattedDuration
                  duration={durationWithinServiceHours
                    .rescale()
                    .set({ seconds: 0, milliseconds: 0 })
                    .rescale()}
                />
              ),
            }}
          />
        ) : (
          durationWithinServiceHours.toISO()
        )}
      </time>
      <ComponentBar componentIds={issueRef.componentIdsAffected} />
    </div>
  );
};
