import classNames from 'classnames';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import {
  FormattedDate,
  FormattedMessage,
  FormattedRelativeTime,
  useIntl,
} from 'react-intl';
import { Link } from 'react-router';
import type { LineSummary } from '~/client';
import { LineSummaryStatusLabels } from '~/constants';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useHydrated } from '../../hooks/useHydrated';
import { DateCard } from './components/DateCard';
import { NonOperationalDateCard } from './components/NonOperationalDateCard';
import { ServiceEndedDateCard } from './components/ServiceEndedDateCard';
import { UptimeCard } from './components/UptimeCard';

interface Props {
  data: LineSummary;
  dateTimes: DateTime<true>[];
}

export const LineSummaryBlock: React.FC<Props> = (props) => {
  const { data, dateTimes } = props;
  const { lineId, status, breakdownByDates } = data;

  const intl = useIntl();

  const { lines, issues } = useIncludedEntities();
  const line = lines[lineId];

  const componentStartedAtDateTime = useMemo(() => {
    if (line.startedAt == null) {
      return null;
    }
    return DateTime.fromISO(line.startedAt);
  }, [line.startedAt]);

  const now = dateTimes[dateTimes.length - 1];
  const serviceStartToday = useMemo(
    () => now.set({ hour: 5, minute: 30 }),
    [now],
  );

  const isHydrated = useHydrated();

  return (
    <div className="flex flex-col rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800">
      <div className="mb-1.5 flex items-center">
        <Link
          className="group flex items-center gap-x-1.5 overflow-hidden truncate font-bold text-base text-gray-700 dark:text-gray-200"
          to={buildLocaleAwareLink(`/lines/${line.id}`, intl.locale)}
        >
          <span
            className="rounded-sm px-2 py-0.5 font-semibold text-white text-xs"
            style={{ backgroundColor: line.color }}
          >
            {line.id}
          </span>
          <span className="group-hover:underline">
            {line.titleTranslations[intl.locale] ?? line.title}
          </span>
        </Link>
        <div className="flex grow justify-end truncate">
          <span
            className={classNames('ms-auto truncate text-sm capitalize', {
              'text-disruption-light dark:text-disruption-dark':
                status === 'ongoing_disruption',
              'text-maintenance-light dark:text-maintenance-dark':
                status === 'ongoing_maintenance',
              'text-infra-light dark:text-infra-dark':
                status === 'ongoing_infra',
              'text-operational-light dark:text-operational-dark':
                status === 'normal',
              'text-gray-400 dark:text-gray-500':
                status === 'closed_for_day' || status === 'future_service',
            })}
          >
            <FormattedMessage {...LineSummaryStatusLabels[status]} />
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-x-1">
        {dateTimes.map((dateTime) => {
          const dateTimeIsoDate = dateTime.toISODate();
          if (
            componentStartedAtDateTime == null ||
            dateTime < componentStartedAtDateTime
          ) {
            return <NonOperationalDateCard key={dateTime.valueOf()} />;
          }
          if (dateTime.hasSame(now, 'day') && now < serviceStartToday) {
            return (
              <ServiceEndedDateCard
                key={dateTime.valueOf()}
                dateTime={dateTime}
                dayType={
                  breakdownByDates[dateTimeIsoDate]?.dayType ?? 'weekday'
                }
                componentRef={line}
              />
            );
          }

          if (!(dateTimeIsoDate in breakdownByDates)) {
            return null;
          }

          return (
            <DateCard
              key={dateTime.valueOf()}
              dateTime={dateTime}
              data={breakdownByDates[dateTimeIsoDate]}
              line={line}
              issues={issues}
            />
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-x-1">
        <span className="text-gray-500 text-xs dark:text-gray-400">
          {isHydrated ? (
            <FormattedDate
              value={dateTimes[0].toJSDate()}
              day="numeric"
              month="short"
              year="numeric"
            />
          ) : (
            dateTimes[0].toISO()
          )}
        </span>
        {data.status !== 'future_service' && (
          <div className="flex items-center">
            <UptimeCard data={data} dateTimes={dateTimes} />
          </div>
        )}
        <span className="text-gray-500 text-xs capitalize dark:text-gray-400">
          {isHydrated ? (
            <FormattedRelativeTime
              value={Math.round(
                dateTimes[dateTimes.length - 1].diffNow('days').as('days'),
              )}
              unit="day"
              numeric="auto"
            />
          ) : (
            dateTimes[dateTimes.length - 1].toISO()
          )}
        </span>
      </div>
    </div>
  );
};
