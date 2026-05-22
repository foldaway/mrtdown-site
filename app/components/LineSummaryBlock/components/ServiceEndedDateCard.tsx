import { CalendarDaysIcon, ClockIcon } from '@heroicons/react/24/outline';
import classNames from 'classnames';
import type { DateTime } from 'luxon';
import { FormattedDate, FormattedMessage } from 'react-intl';
import type { Line, LineSummaryDayType } from '~/types';
import { useHydrated } from '../../../hooks/useHydrated';
import { DAY_TYPE_MESSAGE_DESCRIPTORS } from '../constants';
import { useOperatingHours } from '../hooks/useOperatingHours';

interface Props {
  componentRef: Line;
  dateTime: DateTime;
  dayType: LineSummaryDayType;
  isActive: boolean;
  onToggle: () => void;
}

export const ServiceEndedDateCard: React.FC<Props> = (props) => {
  const { isActive, onToggle } = props;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={props.dateTime.toISODate() ?? undefined}
      aria-expanded={isActive}
      className={classNames(
        'group cursor-pointer rounded-sm transition-all duration-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-1 dark:focus:ring-accent-dark dark:hover:bg-gray-800',
        {
          'bg-gray-100 ring-2 ring-accent-light ring-offset-1 dark:bg-gray-800 dark:ring-accent-dark':
            isActive,
        },
      )}
    >
      <div className="h-7 w-1.5 rounded-xs bg-gray-400 shadow-sm transition-all duration-200 group-hover:scale-125 group-hover:shadow-md group-focus:scale-125 dark:bg-gray-600" />
    </button>
  );
};

export const ServiceEndedDateCardDetails: React.FC<
  Omit<Props, 'isActive' | 'onToggle'>
> = (props) => {
  const { dateTime, dayType, componentRef } = props;

  const isHydrated = useHydrated();

  const operatingHours = useOperatingHours(componentRef, dateTime, dayType);

  return (
    <div className="flex flex-col text-sm">
      <div className="flex items-start gap-x-3 pb-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <CalendarDaysIcon className="size-4" />
        </div>
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

      <div className="border-gray-200 border-t py-3 dark:border-gray-700">
        <div className="grid grid-cols-[auto_1fr] gap-x-3">
          <ClockIcon className="mt-0.5 size-4 text-gray-500 dark:text-gray-400" />
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="font-medium text-gray-700 dark:text-gray-200">
              <FormattedMessage
                id="component.service_hours"
                defaultMessage="Service hours"
              />
            </span>
            <span className="text-gray-600 dark:text-gray-300">
              <FormattedMessage
                id="component.service_hours_description"
                defaultMessage="{start, time, short} to {end, time, short}"
                values={{
                  start: operatingHours.start.toMillis(),
                  end: operatingHours.end.toMillis(),
                }}
              />
            </span>
          </div>
        </div>
      </div>

      <div className="border-gray-200 border-t pt-3 dark:border-gray-700">
        <span className="text-gray-700 dark:text-gray-200">
          <FormattedMessage
            id="general.service_not_started"
            defaultMessage="Service on this day has not started."
          />
        </span>
      </div>
    </div>
  );
};
