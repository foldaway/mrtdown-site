import { DateTime } from 'luxon';
import type { IssueDisruptionUpdate } from '../../../../../types';
import { InformationCircleIcon } from '@heroicons/react/24/solid';
import { WrenchScrewdriverIcon } from '@heroicons/react/24/solid';
import { EyeIcon } from '@heroicons/react/24/solid';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { UserCircleIcon } from '@heroicons/react/24/solid';
import { NewspaperIcon } from '@heroicons/react/24/solid';
import { useMemo } from 'react';

interface Props {
  update: IssueDisruptionUpdate;
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
        {update.type === 'operator.update' && (
          <InformationCircleIcon className="size-4 text-gray-500 dark:text-gray-400" />
        )}
        {update.type === 'operator.investigating' && (
          <WrenchScrewdriverIcon className="size-4 text-gray-500 dark:text-gray-400" />
        )}
        {update.type === 'operator.monitoring' && (
          <EyeIcon className="size-4 text-gray-500 dark:text-gray-400" />
        )}
        {update.type === 'operator.resolved' && (
          <CheckCircleIcon className="size-4 text-operational-light dark:text-operational-dark" />
        )}
        {update.type === 'general-public.report' && (
          <UserCircleIcon className="size-4 text-gray-500 dark:text-gray-400" />
        )}
        {update.type === 'news.report' && (
          <NewspaperIcon className="size-4 text-gray-500 dark:text-gray-400" />
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
