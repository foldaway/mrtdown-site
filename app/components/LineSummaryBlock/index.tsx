import {
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClockIcon,
  Cog8ToothIcon,
  CubeIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid';
import { Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import { Tooltip } from '../BaseUI';
import { useMemo, useState } from 'react';
import {
  FormattedDate,
  FormattedMessage,
  FormattedRelativeTime,
  useIntl,
} from 'react-intl';
import { LineSummaryStatusLabels } from '~/constants';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { LineSummary, LineSummaryStatus } from '~/types';
import { useHydrated } from '../../hooks/useHydrated';
import { DateCard, DateCardDetails } from './components/DateCard';
import { NonOperationalDateCard } from './components/NonOperationalDateCard';
import {
  ServiceEndedDateCard,
  ServiceEndedDateCardDetails,
} from './components/ServiceEndedDateCard';
import { UptimeCard } from './components/UptimeCard';
import { getOperatingHours } from './hooks/useOperatingHours';

interface Props {
  data: LineSummary;
  dateTimes: DateTime<true>[];
}

type ActiveDateCard =
  | { type: 'date'; isoDate: string }
  | { type: 'service-ended'; isoDate: string };

const DATE_CARD_DETAILS_PANEL_CLASS_NAME =
  'mt-3 flex flex-col rounded-lg border border-gray-200 border-t-4 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900';

const STATUS_ICON_CONFIG = {
  ongoing_disruption: {
    Icon: ExclamationTriangleIcon,
    className: classNames('text-disruption-light dark:text-disruption-dark'),
  },
  ongoing_maintenance: {
    Icon: Cog8ToothIcon,
    className: classNames('text-maintenance-light dark:text-maintenance-dark'),
  },
  ongoing_infra: {
    Icon: BuildingOffice2Icon,
    className: classNames('text-infra-light dark:text-infra-dark'),
  },
  normal: {
    Icon: CheckCircleIcon,
    className: classNames('text-operational-light dark:text-operational-dark'),
  },
  closed_for_day: {
    Icon: ClockIcon,
    className: classNames('text-gray-400 dark:text-gray-500'),
  },
  future_service: {
    Icon: CubeIcon,
    className: classNames('text-gray-400 dark:text-gray-500'),
  },
} satisfies Record<
  LineSummaryStatus,
  { Icon: React.ComponentType<{ className?: string }>; className: string }
>;

export const LineSummaryBlock: React.FC<Props> = (props) => {
  const { data, dateTimes } = props;
  const { lineId, status, breakdownByDates } = data;
  const [activeDateCard, setActiveDateCard] = useState<ActiveDateCard | null>(
    null,
  );

  const intl = useIntl();
  const statusLabel = intl.formatMessage(LineSummaryStatusLabels[status]);
  const { Icon: StatusIcon, className: statusIconClassName } =
    STATUS_ICON_CONFIG[status];

  const { lines, issues } = useIncludedEntities();
  const line = lines[lineId];

  const componentStartedAtDateTime = useMemo(() => {
    if (line.startedAt == null) {
      return null;
    }
    return DateTime.fromISO(line.startedAt);
  }, [line.startedAt]);

  const now = dateTimes[dateTimes.length - 1];
  const serviceStartToday = useMemo(() => {
    const todayDayType =
      breakdownByDates[now.toISODate() ?? '']?.dayType ?? 'weekday';
    return getOperatingHours(line, now, todayDayType).start;
  }, [breakdownByDates, line, now]);

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

  const hasActivePanel =
    activeDateTime != null &&
    (activeDateCard?.type === 'service-ended' ||
      (activeDateCard?.type === 'date' && activeDateRecord != null));

  const activateDateCard = (nextDateCard: ActiveDateCard) => {
    if (
      activeDateCard?.type === nextDateCard.type &&
      activeDateCard.isoDate === nextDateCard.isoDate
    ) {
      setActiveDateCard(null);
      return;
    }

    setActiveDateCard(nextDateCard);
  };

  const closeActiveDateCard = () => {
    setActiveDateCard(null);
  };

  return (
    <>
      <fieldset
        className="relative m-0 flex min-w-0 flex-col rounded-lg border-0 bg-gray-100 px-4 py-2 dark:bg-gray-800"
        aria-label={line.id}
      >
        <div className="mb-1.5 grid min-w-0 grid-cols-[minmax(0,_1fr)_auto] items-center gap-x-2">
          <Link
            className="group flex min-w-0 items-center gap-x-1.5 overflow-hidden font-bold text-base text-gray-700 dark:text-gray-200"
            to="/{-$lang}/lines/$lineId"
            params={{ lineId: line.id }}
          >
            <span
              className="shrink-0 rounded-sm px-2 py-0.5 font-semibold text-white text-xs"
              style={{ backgroundColor: line.color }}
            >
              {line.id}
            </span>
            <span className="min-w-0 truncate group-hover:underline">
              {getLocalizedTranslation(line.name, intl.locale)}
            </span>
          </Link>
          <div className="flex min-w-0 justify-end">
            <Tooltip.Provider delayDuration={100}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    aria-label={statusLabel}
                    className={classNames(
                      '-m-1 inline-flex shrink-0 items-center justify-center rounded-md p-1 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                      statusIconClassName,
                    )}
                  >
                    <StatusIcon aria-hidden="true" className="size-5" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="z-50 rounded-md bg-gray-900 px-3 py-2 font-medium text-white text-xs shadow-lg dark:bg-gray-700"
                    sideOffset={4}
                  >
                    <FormattedMessage {...LineSummaryStatusLabels[status]} />
                    <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>
        </div>

        <div
          className="grid items-center gap-x-1 sm:gap-x-0.5 lg:gap-x-px"
          style={{
            gridTemplateColumns: `repeat(${dateTimes.length}, minmax(0, 1fr))`,
          }}
        >
          {dateTimes.map((dateTime) => {
            const dateTimeIsoDate = dateTime.toISODate();
            if (
              componentStartedAtDateTime == null ||
              dateTime < componentStartedAtDateTime
            ) {
              return <NonOperationalDateCard key={dateTime.valueOf()} />;
            }
            if (
              dateTime.hasSame(now, 'day') &&
              status === 'closed_for_day' &&
              now < serviceStartToday
            ) {
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

        {hasActivePanel &&
          activeDateCard != null &&
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
                onClose={closeActiveDateCard}
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
                onClose={closeActiveDateCard}
              />
            </div>
          ) : null)}
      </fieldset>
    </>
  );
};
