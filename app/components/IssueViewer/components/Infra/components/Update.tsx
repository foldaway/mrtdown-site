import { DateTime } from 'luxon';
import type { IssueInfraUpdate } from '../../../../../types';
import { useMemo } from 'react';
import { InformationCircleIcon } from '@heroicons/react/16/solid';
import { useHydrated } from '../../../../../hooks/useHydrated';
import { FormattedDate, FormattedRelativeTime } from 'react-intl';

interface Props {
  update: IssueInfraUpdate;
}

export const Update: React.FC<Props> = (props) => {
  const { update } = props;

  const createdAt = useMemo(
    () => DateTime.fromISO(update.createdAt),
    [update.createdAt],
  );

  const isHydrated = useHydrated();

  return (
    <div className="flex gap-x-2">
      <div className="inline-flex shrink-0">
        {update.type === 'operator.update' && (
          <InformationCircleIcon className="size-4 text-gray-500 dark:text-gray-400" />
        )}
      </div>

      <div className="flex flex-col gap-y-0.5">
        <time
          className="text-gray-500 text-xs dark:text-gray-400"
          dateTime={update.createdAt}
        >
          {isHydrated ? (
            <>
              <FormattedDate
                value={createdAt.toJSDate()}
                day="numeric"
                month="long"
                year="numeric"
              />{' '}
              (
              <FormattedRelativeTime
                value={Math.round(createdAt.diffNow().as('days'))}
                unit="day"
                numeric="auto"
              />
              )
            </>
          ) : (
            <>{createdAt.toISO()}</>
          )}
        </time>

        <span className="text-gray-900 text-sm dark:text-gray-300">
          {update.text}
        </span>
      </div>
    </div>
  );
};
