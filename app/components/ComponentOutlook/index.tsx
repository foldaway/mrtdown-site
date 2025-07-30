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
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useHydrated } from '../../hooks/useHydrated';
import type { DateSummary } from '../../types';
import { assert } from '../../util/assert';
import { DateCard } from './components/DateCard';
import { NonOperationalDateCard } from './components/NonOperationalDateCard';
import { ServiceEndedDateCard } from './components/ServiceEndedDateCard';
import { UptimeCard } from './components/UptimeCard';
import type { ComponentBreakdown } from './helpers/computeComponentBreakdowns';
import { computeStatus } from './helpers/computeStatus';

const DATE_OVERVIEW_DEFAULT: DateSummary = {
  issueTypesDurationMs: {},
  issueTypesIntervalsNoOverlapMs: {},
  issues: [],
  componentIdsIssueTypesDurationMs: {},
  componentIdsIssueTypesIntervalsNoOverlapMs: {},
};

interface Props {
  breakdown: ComponentBreakdown;
  dateTimes: DateTime<true>[];
}

export const ComponentOutlook: React.FC<Props> = (props) => {
  const { breakdown, dateTimes } = props;
  const { component, dates } = breakdown;

  const intl = useIntl();

  const componentStartedAtDateTime = useMemo(() => {
    return DateTime.fromISO(component.startedAt);
  }, [component.startedAt]);

  const now = dateTimes[dateTimes.length - 1];
  const serviceStartToday = useMemo(
    () => now.set({ hour: 5, minute: 30 }),
    [now],
  );

  const isComponentInService = useMemo(() => {
    return componentStartedAtDateTime < now;
  }, [now, componentStartedAtDateTime]);

  const statusNow = useMemo(() => {
    const nowIsoDate = now.toISODate();
    assert(nowIsoDate != null);

    if (now < serviceStartToday) {
      return 'service ended';
    }

    if (breakdown.issuesOngoing.length === 0) {
      return 'operational';
    }

    return computeStatus(breakdown.issuesOngoing) ?? 'operational';
  }, [now, serviceStartToday, breakdown.issuesOngoing]);

  const isHydrated = useHydrated();

  return (
    <div className="flex flex-col rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800">
      <div className="mb-1.5 flex items-center gap-x-1.5">
        <span
          className="rounded-sm px-2 py-0.5 font-semibold text-white text-xs"
          style={{ backgroundColor: component.color }}
        >
          {component.id}
        </span>
        <Link
          className="overflow-hidden truncate font-bold text-base text-gray-700 hover:underline dark:text-gray-200"
          to={buildLocaleAwareLink(`/lines/${component.id}`, intl.locale)}
        >
          {component.title_translations[intl.locale] ?? component.title}
        </Link>
        <div className="flex grow justify-end truncate">
          {isComponentInService ? (
            <>
              <span
                className={classNames('ms-auto truncate text-sm capitalize', {
                  'text-disruption-light dark:text-disruption-dark':
                    statusNow === 'disruption',
                  'text-maintenance-light dark:text-maintenance-dark':
                    statusNow === 'maintenance',
                  'text-infra-light dark:text-infra-dark':
                    statusNow === 'infra',
                  'text-operational-light dark:text-operational-dark':
                    statusNow === 'operational',
                  'text-gray-400 dark:text-gray-500':
                    statusNow === 'service ended',
                })}
              >
                {statusNow === 'disruption' && (
                  <FormattedMessage
                    id="general.disruption"
                    defaultMessage="Disruption"
                  />
                )}{' '}
                {statusNow === 'maintenance' && (
                  <FormattedMessage
                    id="general.maintenance"
                    defaultMessage="Maintenance"
                  />
                )}
                {statusNow === 'infra' && (
                  <FormattedMessage
                    id="general.infrastructure"
                    defaultMessage="Infrastructure"
                  />
                )}
                {statusNow === 'operational' && (
                  <FormattedMessage
                    id="status.operational"
                    defaultMessage="Operational"
                  />
                )}
                {statusNow === 'service ended' && (
                  <FormattedMessage
                    id="status.service_ended"
                    defaultMessage="Service Ended"
                  />
                )}
              </span>
            </>
          ) : (
            <span className="text-gray-400 text-sm dark:text-gray-500">
              <FormattedMessage
                id="status.not_in_service"
                defaultMessage="Not in Service"
              />
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-x-1">
        {dateTimes.map((dateTime) => {
          const dateTimeIsoDate = dateTime.toISODate();
          if (dateTime < componentStartedAtDateTime) {
            return <NonOperationalDateCard key={dateTime.valueOf()} />;
          }
          if (dateTime.hasSame(now, 'day') && now < serviceStartToday) {
            return (
              <ServiceEndedDateCard
                key={dateTime.valueOf()}
                dateTime={dateTime}
              />
            );
          }
          return (
            <DateCard
              key={dateTime.valueOf()}
              dateTime={dateTime}
              dateOverview={dates[dateTimeIsoDate] ?? DATE_OVERVIEW_DEFAULT}
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
        {isComponentInService && (
          <div className="flex items-center">
            <UptimeCard dates={dates} dateTimes={dateTimes} />
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
