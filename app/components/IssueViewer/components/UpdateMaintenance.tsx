import { DateTime } from 'luxon';
import { decode } from 'html-entities';
import type { IssueMaintenanceUpdate } from '../../../types';
import { useMemo } from 'react';
import { ClockIcon, InformationCircleIcon } from '@heroicons/react/24/solid';
import { useHydrated } from '../../../hooks/useHydrated';
import { FormattedDate, useIntl } from 'react-intl';

interface Props {
  update: IssueMaintenanceUpdate;
}

export const UpdateMaintenance: React.FC<Props> = (props) => {
  const { update } = props;

  const createdAt = useMemo(
    () => DateTime.fromISO(update.createdAt).setZone('Asia/Singapore'),
    [update.createdAt],
  );

  const isHydrated = useHydrated();
  const intl = useIntl();

  return (
    <div className="flex gap-x-2">
      <div className="inline-flex shrink-0">
        <a
          className="flex transition-transform duration-75 hover:scale-110"
          href={update.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {update.type === 'planned' && (
            <ClockIcon className="size-4 text-gray-500 dark:text-gray-400" />
          )}
          {update.type === 'operator.update' && (
            <InformationCircleIcon className="size-4 text-gray-500 dark:text-gray-400" />
          )}
        </a>
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
                hour="numeric"
                minute="numeric"
              />{' '}
              ({createdAt.reconfigure({ locale: intl.locale }).toRelative()})
            </>
          ) : (
            <>{createdAt.toISO()}</>
          )}
        </time>
        <span className="text-gray-900 text-sm dark:text-gray-300">
          {decode(update.text)}
        </span>
      </div>
    </div>
  );
};
