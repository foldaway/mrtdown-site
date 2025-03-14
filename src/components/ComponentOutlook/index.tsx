import { useMemo } from 'react';
import type { OverviewComponent, DateSummary } from '../../types';
import { DateTime } from 'luxon';
import { DateCard } from './components/DateCard';
import { computeStatus } from './helpers/computeStatus';
import { assert } from '../../util/assert';
import classNames from 'classnames';

const DATE_OVERVIEW_DEFAULT: DateSummary = {
  issueTypesDurationMs: {},
  issues: [],
};

interface Props {
  entry: OverviewComponent;
  dateTimes: DateTime[];
}

export const ComponentOutlook: React.FC<Props> = (props) => {
  const { entry, dateTimes } = props;
  const { component, dates } = entry;

  const componentStartedAtDateTime = useMemo(() => {
    return DateTime.fromISO(component.startedAt);
  }, [component.startedAt]);

  const statusToday = useMemo(() => {
    const now = dateTimes[dateTimes.length - 1];
    if (now < componentStartedAtDateTime) {
      return 'not operational';
    }
    const nowIsoDate = now.toISODate();
    assert(nowIsoDate != null);
    return (
      computeStatus(dates[nowIsoDate]?.issueTypesDurationMs ?? {}) ??
      'operational'
    );
  }, [dateTimes, dates, componentStartedAtDateTime]);

  return (
    <div className="flex flex-col rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800">
      <div className="mb-1 flex items-center">
        <span
          className="rounded-sm px-2 py-0.5 font-semibold text-white text-xs"
          style={{ backgroundColor: component.color }}
        >
          {component.id}
        </span>
        <span className="ms-1.5 font-bold text-base text-gray-700 dark:text-gray-200">
          {component.title}
        </span>

        <span
          className={classNames('ms-auto text-sm capitalize', {
            'text-disruption-major-light dark:text-disruption-major-dark':
              statusToday === 'disruption',
            'text-maintenance-light dark:text-maintenance-dark':
              statusToday === 'maintenance',
            'text-infra-light dark:text-infra-dark': statusToday === 'infra',
            'text-operational-light dark:text-operational-dark':
              statusToday === 'operational',
            'text-gray-400 dark:text-gray-600':
              statusToday === 'not operational',
          })}
        >
          {statusToday}
        </span>
      </div>

      <div className="flex items-center justify-between gap-x-1">
        {dateTimes.map((dateTime) => {
          const dateTimeIsoDate = dateTime.toISODate();
          assert(dateTimeIsoDate != null);
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

      <div className="mt-1 flex items-center justify-between gap-x-1">
        <span className="text-gray-500 text-xs dark:text-gray-400">
          {dateTimes[0].toLocaleString(DateTime.DATE_MED)}
        </span>
        <span className="text-gray-500 text-xs capitalize dark:text-gray-400">
          {dateTimes[dateTimes.length - 1].toRelativeCalendar()}
        </span>
      </div>
    </div>
  );
};
