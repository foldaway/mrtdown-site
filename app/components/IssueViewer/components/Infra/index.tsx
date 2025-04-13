import { Link } from 'react-router';
import type { IssueInfra } from '../../../../types';
import { Update } from './components/Update';
import { DateTime, Interval } from 'luxon';
import { useMemo } from 'react';
import { ComponentBar } from '../../../ComponentBar';
import { BuildingOfficeIcon } from '@heroicons/react/24/solid';
import { calculateDurationWithinServiceHours } from '../../../../helpers/calculateDurationWithinServiceHours';
import { useHydrated } from '../../../../hooks/useHydrated';
import { StationMap } from '~/components/StationMap';

interface Props {
  issue: IssueInfra;
}

export const Infra: React.FC<Props> = (props) => {
  const { issue } = props;

  const startAt = useMemo(
    () => DateTime.fromISO(issue.startAt),
    [issue.startAt],
  );
  const endAt = useMemo(() => {
    if (issue.endAt == null) {
      return null;
    }

    return DateTime.fromISO(issue.endAt);
  }, [issue.endAt]);

  const dateTimeInfo = useMemo(() => {
    if (endAt == null) {
      return null;
    }
    return {
      interval: Interval.fromDateTimes(startAt, endAt),
      durationWithinServiceHours: calculateDurationWithinServiceHours(
        startAt,
        endAt,
      ),
    };
  }, [startAt, endAt]);

  const isHydrated = useHydrated();

  return (
    <div className="flex flex-col bg-gray-100 dark:bg-gray-800">
      <Link
        className="group flex items-center gap-x-2 bg-infra-light px-4 py-2 text-gray-50 dark:bg-infra-dark dark:text-gray-200"
        to={`/issues/${issue.id}`}
      >
        <BuildingOfficeIcon className="size-5 text-gray-50 dark:text-gray-200" />
        <h2 className="font-bold text-base group-hover:underline">
          {issue.title}
        </h2>
      </Link>
      <div className="flex flex-col justify-between gap-1.5 bg-gray-200 px-4 py-2 sm:flex-row sm:items-center dark:bg-gray-700">
        <div className="inline-flex items-center">
          <span className="text-gray-500 text-xs dark:text-gray-400">
            Affected:&nbsp;
          </span>
          <ComponentBar componentIds={issue.componentIdsAffected} />
        </div>
        <span className="text-gray-500 text-xs dark:border-gray-300 dark:text-gray-400">
          {dateTimeInfo == null ? (
            'Ongoing'
          ) : (
            <>
              {isHydrated
                ? dateTimeInfo.interval.toLocaleString({
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric',
                  })
                : dateTimeInfo.interval.toISO()}{' '}
              (
              {isHydrated
                ? dateTimeInfo.durationWithinServiceHours
                    .rescale()
                    .set({ seconds: 0 })
                    .rescale()
                    .toHuman({ unitDisplay: 'short' })
                : dateTimeInfo.durationWithinServiceHours.toISO()}{' '}
              within service hours)
            </>
          )}
        </span>
      </div>
      <div className="flex flex-col gap-y-4 p-4">
        {issue.updates.map((update) => (
          <Update key={update.sourceUrl} update={update} />
        ))}
      </div>

      <div className="flex flex-col gap-y-4 bg-gray-200 p-4 dark:bg-gray-700">
        <StationMap
          componentIdsAffected={issue.componentIdsAffected}
          stationIdsAffected={issue.stationIdsAffected}
        />
      </div>
    </div>
  );
};
