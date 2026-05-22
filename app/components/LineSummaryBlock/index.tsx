import { Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';
import {
  FormattedDate,
  FormattedMessage,
  FormattedRelativeTime,
  useIntl,
} from 'react-intl';
import type { LineSummary } from '~/types';
import { LineSummaryStatusLabels } from '~/constants';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { useHydrated } from '../../hooks/useHydrated';
import { DateCard, DateCardDetails } from './components/DateCard';
import { NonOperationalDateCard } from './components/NonOperationalDateCard';
import {
  ServiceEndedDateCard,
  ServiceEndedDateCardDetails,
} from './components/ServiceEndedDateCard';
import { UptimeCard } from './components/UptimeCard';

interface Props {
  data: LineSummary;
  dateTimes: DateTime<true>[];
}

type ActiveDateCard =
  | { type: 'date'; isoDate: string }
  | { type: 'service-ended'; isoDate: string };

const DATE_CARD_DETAILS_PANEL_CLASS_NAME =
  'absolute inset-x-0 top-full z-30 mt-2 flex flex-col rounded-lg border border-gray-200 border-t-4 bg-white px-4 py-3 shadow-gray-900/10 shadow-xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/30 dark:ring-white/10';

export const LineSummaryBlock: React.FC<Props> = (props) => {
  const { data, dateTimes } = props;
  const { lineId, status, breakdownByDates } = data;
  const [activeDateCard, setActiveDateCard] = useState<ActiveDateCard | null>(
    null,
  );

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

  const activeDateTime = useMemo(() => {
    if (activeDateCard == null) {
      return null;
    }

    return (
      dateTimes.find((dateTime) => {
        return dateTime.toISODate() === activeDateCard.isoDate;
      }) ?? null
    );
  }, [activeDateCard, dateTimes]);

  const activeDateRecord =
    activeDateCard == null ? null : breakdownByDates[activeDateCard.isoDate];

  const activateDateCard = (nextDateCard: ActiveDateCard) => {
    setActiveDateCard(nextDateCard);
  };

  return (
    <>
      {activeDateCard != null && (
        <button
          type="button"
          aria-label="Close date details"
          className="fixed inset-0 z-20 cursor-default bg-transparent"
          onClick={() => {
            setActiveDateCard(null);
          }}
        />
      )}
      <fieldset
        className={classNames(
          'relative m-0 flex min-w-0 flex-col rounded-lg border-0 bg-gray-100 px-4 py-2 dark:bg-gray-800',
          {
            'z-30': activeDateCard != null,
          },
        )}
        aria-label={line.id}
      >
        <div className="mb-1.5 flex items-center">
          <Link
            className="group flex items-center gap-x-1.5 overflow-hidden truncate font-bold text-base text-gray-700 dark:text-gray-200"
            to="/{-$lang}/lines/$lineId"
            params={{ lineId: line.id }}
          >
            <span
              className="rounded-sm px-2 py-0.5 font-semibold text-white text-xs"
              style={{ backgroundColor: line.color }}
            >
              {line.id}
            </span>
            <span className="group-hover:underline">
              {getLocalizedTranslation(line.name, intl.locale)}
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
              const isoDate = dateTime.toISODate();
              return (
                <ServiceEndedDateCard
                  key={dateTime.valueOf()}
                  dateTime={dateTime}
                  dayType={
                    breakdownByDates[dateTimeIsoDate]?.dayType ?? 'weekday'
                  }
                  componentRef={line}
                  isActive={
                    activeDateCard?.type === 'service-ended' &&
                    activeDateCard.isoDate === isoDate
                  }
                  onActivate={() => {
                    if (isoDate != null) {
                      activateDateCard({ type: 'service-ended', isoDate });
                    }
                  }}
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
                isActive={
                  activeDateCard?.type === 'date' &&
                  activeDateCard.isoDate === dateTimeIsoDate
                }
                onActivate={() => {
                  if (dateTimeIsoDate != null) {
                    activateDateCard({
                      type: 'date',
                      isoDate: dateTimeIsoDate,
                    });
                  }
                }}
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
              <UptimeCard data={data} />
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

        {activeDateCard != null &&
          activeDateTime != null &&
          (activeDateCard.type === 'date' && activeDateRecord != null ? (
            <div
              className={DATE_CARD_DETAILS_PANEL_CLASS_NAME}
              style={{ borderTopColor: line.color }}
            >
              <DateCardDetails
                dateTime={activeDateTime}
                data={activeDateRecord}
                line={line}
                issues={issues}
              />
            </div>
          ) : activeDateCard.type === 'service-ended' ? (
            <div
              className={DATE_CARD_DETAILS_PANEL_CLASS_NAME}
              style={{ borderTopColor: line.color }}
            >
              <ServiceEndedDateCardDetails
                dateTime={activeDateTime}
                dayType={activeDateRecord?.dayType ?? 'weekday'}
                componentRef={line}
              />
            </div>
          ) : null)}
      </fieldset>
    </>
  );
};
