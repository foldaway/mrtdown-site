import { DateTime } from 'luxon';
import type { IssueMaintenanceUpdate } from '../../../../../types';
import { useMemo } from 'react';
import { ClockIcon } from '@heroicons/react/24/solid';

interface Props {
  update: IssueMaintenanceUpdate;
}

export const Update: React.FC<Props> = (props) => {
  const { update } = props;

  const createdAt = useMemo(
    () => DateTime.fromISO(update.createdAt),
    [update.createdAt],
  );

  return (
    <div className="flex gap-x-2">
      <div className="inline-flex shrink-0">
        {update.type === 'planned' && (
          <ClockIcon className="size-4 text-gray-500 dark:text-gray-400" />
        )}
      </div>

      <div className="flex flex-col gap-y-0.5">
        <time
          className="text-gray-500 text-xs dark:text-gray-400"
          dateTime={update.createdAt}
        >
          {createdAt.toLocaleString(DateTime.DATETIME_MED)} (
          {createdAt.toRelative()})
        </time>
        <span className="text-gray-900 text-sm dark:text-gray-300">
          {update.text}
        </span>
      </div>
    </div>
  );
};
