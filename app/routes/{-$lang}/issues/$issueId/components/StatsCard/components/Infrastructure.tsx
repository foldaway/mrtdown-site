import {
  CalendarDaysIcon,
  ClockIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import { Duration } from 'luxon';
import { useMemo } from 'react';
import { FormattedMessage, FormattedNumber } from 'react-intl';
import type { Issue } from '~/types';

interface Props {
  issue: Issue;
}

export const Infrastructure: React.FC<Props> = (props) => {
  const { issue } = props;

  const stationCount = useMemo(() => {
    const stationIds = new Set<string>();

    for (const branch of issue.branchesAffected) {
      for (const stationId of branch.stationIds) {
        stationIds.add(stationId);
      }
    }

    return stationIds.size;
  }, [issue.branchesAffected]);

  return (
    <>
      <div className="col-span-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <dt className="flex items-center gap-2 font-semibold text-gray-600 text-xs dark:text-gray-300">
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-accent-light/10 text-accent-light ring-1 ring-accent-light/25 dark:bg-accent-dark/15 dark:text-accent-dark dark:ring-accent-dark/30">
            <ClockIcon className="size-4" />
          </span>
          <FormattedMessage
            id="issue.details.total_days"
            defaultMessage="Total days"
          />
        </dt>
        <dd className="mt-3 font-bold text-3xl text-gray-900 leading-none dark:text-gray-100">
          <FormattedNumber
            value={Duration.fromObject({ seconds: issue.durationSeconds }).as(
              'days',
            )}
          />
        </dd>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <dt className="flex items-center gap-1.5 font-semibold text-[11px] text-gray-500 leading-tight dark:text-gray-400">
          <MapPinIcon className="size-3.5 shrink-0 text-accent-light dark:text-accent-dark" />
          <FormattedMessage
            id="issue.details.stations_affected"
            defaultMessage="Stations affected"
          />
        </dt>
        <dd className="mt-2 font-bold text-2xl text-gray-900 leading-none dark:text-gray-100">
          {stationCount}
        </dd>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <dt className="flex items-center gap-1.5 font-semibold text-[11px] text-gray-500 leading-tight dark:text-gray-400">
          <CalendarDaysIcon className="size-3.5 shrink-0 text-accent-light dark:text-accent-dark" />
          <FormattedMessage
            id="issue.details.sessions"
            defaultMessage="Sessions"
          />
        </dt>
        <dd className="mt-2 font-bold text-2xl text-gray-900 leading-none dark:text-gray-100">
          <FormattedNumber value={issue.intervals.length} />
        </dd>
      </div>
    </>
  );
};
