import {
  CalendarDaysIcon,
  ClockIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import classNames from 'classnames';
import type { DateTime } from 'luxon';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';
import type { Line, LineSummaryDayType } from '~/types';
import { useHydrated } from '../../../hooks/useHydrated';
import { DAY_TYPE_MESSAGE_DESCRIPTORS } from '../constants';
import { useOperatingHours } from '../hooks/useOperatingHours';

interface Props {
  componentRef: Line;
  dateTime: DateTime;
  dayType: LineSummaryDayType;
  isActive: boolean;
  onActivate: () => void;
}

interface DetailsProps extends Omit<Props, 'isActive' | 'onActivate'> {
  onClose: () => void;
}

export const ServiceEndedDateCard: React.FC<Props> = (props) => {
  const { isActive, onActivate, dateTime } = props;
  const intl = useIntl();
  const isoDate = dateTime.toISODate();
  const ariaLabel =
    isoDate == null
      ? undefined
      : intl.formatMessage(
          {
            id: 'component.view_details_for_date',
            defaultMessage: 'View details for {date}',
          },
          { date: isoDate },
        );

  return (
    <button
      type="button"
      onClick={onActivate}
      aria-label={ariaLabel}
      aria-expanded={isActive}
      className={classNames(
        'group hover:-translate-y-0.5 flex h-9 min-w-0 cursor-pointer items-center justify-center rounded-sm transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light focus-visible:ring-offset-1 active:translate-y-0 active:scale-95 dark:focus-visible:ring-accent-dark',
        {
          'bg-accent-light/10 shadow-inner dark:bg-accent-dark/15': isActive,
        },
      )}
    >
      <div
        className={classNames(
          'w-full rounded-xs bg-gray-400 transition-all duration-150 group-hover:scale-105 group-hover:brightness-110 group-focus-visible:scale-105 dark:bg-gray-600',
          isActive ? 'h-9 brightness-110' : 'h-7',
        )}
      />
    </button>
  );
};

export const ServiceEndedDateCardDetails: React.FC<DetailsProps> = (props) => {
  const { dateTime, dayType, componentRef, onClose } = props;

  const isHydrated = useHydrated();

  const operatingHours = useOperatingHours(componentRef, dateTime, dayType);

  return (
    <div className="flex flex-col text-sm">
      <div className="grid grid-cols-[minmax(0,_1fr)_auto] gap-3 pb-3">
        <div className="flex items-start gap-x-3">
          <CalendarDaysIcon className="mt-0.5 size-5 shrink-0 text-gray-500 dark:text-gray-400" />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 leading-tight dark:text-gray-100">
              {isHydrated ? (
                <FormattedDate
                  value={dateTime.toJSDate()}
                  year="numeric"
                  month="short"
                  day="numeric"
                  weekday="long"
                />
              ) : (
                dateTime.toISO()
              )}
            </p>
            <p className="mt-1 text-gray-500 text-xs dark:text-gray-400">
              <FormattedMessage
                id="component.service_hours_title"
                defaultMessage="Service hours ({type})"
                values={{
                  type: (
                    <FormattedMessage
                      {...DAY_TYPE_MESSAGE_DESCRIPTORS[dayType]}
                    />
                  ),
                }}
              />
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-x-1 rounded-md px-2 py-1 font-medium text-gray-600 text-xs hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-accent-light focus-visible:outline-offset-2 dark:text-gray-300 dark:focus-visible:outline-accent-dark dark:hover:bg-gray-800 dark:hover:text-gray-100"
        >
          <XMarkIcon aria-hidden="true" className="size-4" />
          <FormattedMessage id="general.close" defaultMessage="Close" />
        </button>
      </div>

      <div className="border-gray-200 border-t pt-3 dark:border-gray-700">
        <p className="flex items-start gap-x-2 text-gray-700 dark:text-gray-200">
          <ClockIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-gray-500 dark:text-gray-400"
          />
          <FormattedMessage
            id="general.service_not_started"
            defaultMessage="Service has not started. Scheduled for {start, time, short} to {end, time, short}."
            values={{
              start: operatingHours.start.toMillis(),
              end: operatingHours.end.toMillis(),
            }}
          />
        </p>
      </div>
    </div>
  );
};
