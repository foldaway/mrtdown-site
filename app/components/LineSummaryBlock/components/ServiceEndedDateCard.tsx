import { ClockIcon } from '@heroicons/react/24/outline';
import type { DateTime } from 'luxon';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { FormattedDate, FormattedMessage } from 'react-intl';
import { useDebounce } from 'use-debounce';
import type { Line, LineSummaryDayType } from '~/client';
import { useHydrated } from '../../../hooks/useHydrated';
import { DAY_TYPE_MESSAGE_DESCRIPTORS } from '../constants';
import { useOperatingHours } from '../hooks/useOperatingHours';

interface Props {
  componentRef: Line;
  dateTime: DateTime;
  dayType: LineSummaryDayType;
}

export const ServiceEndedDateCard: React.FC<Props> = (props) => {
  const { dateTime, dayType, componentRef } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [isOpenDebounced] = useDebounce(isOpen, 100);

  const isHydrated = useHydrated();

  const operatingHours = useOperatingHours(componentRef, dateTime, dayType);

  return (
    <Popover.Root open={isOpenDebounced} onOpenChange={setIsOpen}>
      <Popover.Trigger
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="group cursor-pointer rounded-sm transition-all duration-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-1 dark:focus:ring-accent-dark dark:hover:bg-gray-800"
      >
        <div className="h-7 w-1.5 rounded-xs bg-gray-400 shadow-sm transition-all duration-200 group-hover:scale-125 group-hover:shadow-md group-focus:scale-125 dark:bg-gray-600" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-50 flex w-72 flex-col rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg outline-none ring-1 ring-black/5 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800 dark:ring-white/10"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
          side="top"
          sideOffset={8}
        >
          <span className="mb-2 font-semibold text-base text-gray-900 dark:text-gray-100">
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
          </span>

          <div className="mb-3 grid grid-cols-[auto_1fr] grid-rows-2 items-center gap-x-2 gap-y-1">
            <ClockIcon className="size-4 shrink-0 text-gray-600 dark:text-gray-300" />
            <span className="font-medium text-gray-700 text-sm dark:text-gray-200">
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
            </span>
            <div />
            <span className="text-gray-600 text-sm dark:text-gray-300">
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

          <div className="mt-2 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-700">
            <span className="font-medium text-gray-700 text-sm dark:text-gray-200">
              <FormattedMessage
                id="general.service_not_started"
                defaultMessage="Service on this day has not started."
              />
            </span>
          </div>

          <Popover.Arrow className="fill-white dark:fill-gray-800" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
