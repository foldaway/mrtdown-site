import classNames from 'classnames';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import type { DateSummary } from '../../types';
import { assert } from '../../util/assert';
import { DateCard } from './components/DateCard';
import { UptimeCard } from './components/UptimeCard';
import type { ComponentBreakdown } from './helpers/computeComponentBreakdowns';
import { computeStatus } from './helpers/computeStatus';
import { useHydrated } from '../../hooks/useHydrated';

const DATE_OVERVIEW_DEFAULT: DateSummary = {
  issueTypesDurationMs: {},
  issues: [],
  componentIdsIssueTypesDurationMs: {},
};

interface Props {
  breakdown: ComponentBreakdown;
  dateTimes: DateTime<true>[];
}

export const ComponentOutlook: React.FC<Props> = (props) => {
  const { breakdown, dateTimes } = props;
  const { component, dates } = breakdown;

  const componentStartedAtDateTime = useMemo(() => {
    return DateTime.fromISO(component.startedAt);
  }, [component.startedAt]);

  const now = dateTimes[dateTimes.length - 1];

  const isOperational = useMemo(() => {
    return componentStartedAtDateTime < now;
  }, [now, componentStartedAtDateTime]);

  const statusToday = useMemo(() => {
    const nowIsoDate = now.toISODate();
    assert(nowIsoDate != null);

    return (
      computeStatus(dates[nowIsoDate]?.issueTypesDurationMs ?? {}) ??
      'operational'
    );
  }, [dates, now]);

  const isHydrated = useHydrated();

  return (
    <div className="flex flex-col rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800">
      <div className="mb-1.5 flex items-center">
        <span
          className="rounded-sm px-2 py-0.5 font-semibold text-white text-xs"
          style={{ backgroundColor: component.color }}
        >
          {component.id}
        </span>
        <span className="ms-1.5 font-bold text-base text-gray-700 dark:text-gray-200">
          {component.title}
        </span>

        <div className="ms-auto flex">
          {isOperational ? (
            <>
              <span
                className={classNames('ms-auto text-sm capitalize', {
                  'text-disruption-light dark:text-disruption-dark':
                    statusToday === 'disruption',
                  'text-maintenance-light dark:text-maintenance-dark':
                    statusToday === 'maintenance',
                  'text-infra-light dark:text-infra-dark':
                    statusToday === 'infra',
                  'text-operational-light dark:text-operational-dark':
                    statusToday === 'operational',
                })}
              >
                {statusToday}
              </span>
            </>
          ) : (
            <span className="text-gray-400 text-sm dark:text-gray-500">
              Not Operational
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-x-1">
        {dateTimes.map((dateTime) => {
          const dateTimeIsoDate = dateTime.toISODate();
          return (
            <DateCard
              key={dateTime.valueOf()}
              dateTime={dateTime}
              dateOverview={dates[dateTimeIsoDate] ?? DATE_OVERVIEW_DEFAULT}
              isBeforeComponentStartDate={dateTime < componentStartedAtDateTime}
            />
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-x-1">
        <span className="text-gray-500 text-xs dark:text-gray-400">
          {isHydrated
            ? dateTimes[0].toLocaleString(DateTime.DATE_MED)
            : dateTimes[0].toISO()}
        </span>
        {isOperational && (
          <div className="flex items-center">
            <UptimeCard dates={dates} dateTimes={dateTimes} />
          </div>
        )}
        <span className="text-gray-500 text-xs capitalize dark:text-gray-400">
          {isHydrated
            ? dateTimes[dateTimes.length - 1].toRelativeCalendar()
            : dateTimes[dateTimes.length - 1].toISO()}
        </span>
      </div>
    </div>
  );
};
