import { useMemo } from 'react';
import type { IssueRef } from '../../../../../types';
import { DateTime, Interval } from 'luxon';
import { assert } from '../../../../../util/assert';
import { ComponentBar } from '../../../../ComponentBar';
import { Link } from 'react-router';
import { calculateDurationWithinServiceHours } from '../../../../../helpers/calculateDurationWithinServiceHours';
import { useHydrated } from '../../../../../hooks/useHydrated';

interface Props {
  issueRef: IssueRef;
}

export const Item: React.FC<Props> = (props) => {
  const { issueRef } = props;

  const startAt = useMemo(() => {
    const dateTime = DateTime.fromISO(issueRef.startAt);
    assert(dateTime.isValid);
    return dateTime;
  }, [issueRef.startAt]);

  const endAt = useMemo(() => {
    assert(issueRef.endAt != null);
    const dateTime = DateTime.fromISO(issueRef.endAt);
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
    <Link className="flex flex-col py-1" to={`/issues/${issueRef.id}`}>
      <span className="line-clamp-1 text-gray-700 text-sm dark:text-gray-200">
        {issueRef.title}
      </span>
      <time className="mt-0.5 mb-1.5 text-gray-400 text-xs dark:text-gray-500">
        {isHydrated
          ? interval.toLocaleString({
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
            })
          : interval.toISO()}
        <br />
        {isHydrated
          ? durationWithinServiceHours
              .rescale()
              .set({ seconds: 0, milliseconds: 0 })
              .rescale()
              .toHuman({ unitDisplay: 'short' })
          : durationWithinServiceHours.toISO()}{' '}
        within service hours
      </time>
      <ComponentBar componentIds={issueRef.componentIdsAffected} />
    </Link>
  );
};
