import { useMemo } from 'react';
import type { IssueRef } from '../../../../../types';
import { DateTime } from 'luxon';
import { assert } from '../../../../../util/assert';
import { ComponentBar } from '../../../../ComponentBar';
import { Link } from 'react-router';

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

  return (
    <Link className="flex flex-col py-1" to={`/issues/${issueRef.id}`}>
      <span className="text-gray-700 line-clamp-1 text-sm dark:text-gray-200">
        {issueRef.title}
      </span>
      <time className="mb-1.5 mt-0.5 text-gray-400 dark:text-gray-500 text-xs">
        {new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
        }).formatRange(startAt.toJSDate(), endAt.toJSDate())}
        <br />
        {endAt
          .diff(startAt)
          .rescale()
          .set({ seconds: 0, milliseconds: 0 })
          .rescale()
          .toHuman()}
      </time>
      <ComponentBar componentIds={issueRef.componentIdsAffected} />
    </Link>
  );
};
