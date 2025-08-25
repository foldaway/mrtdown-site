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
        className="outline-none"
      >
        <div className="h-7 w-1.5 rounded-xs bg-gray-400 transition-transform hover:scale-150 dark:bg-gray-600" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="flex w-64 flex-col rounded border border-gray-300 bg-gray-100 px-4 py-2 outline-none dark:border-gray-600 dark:bg-gray-700"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <span className="mb-1 font-bold text-gray-600 text-sm dark:text-gray-300">
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

          <div className="mb-1 grid grid-cols-[auto_1fr] grid-rows-2 items-center gap-x-1">
            <ClockIcon className="size-4 shrink-0 text-gray-500 dark:text-gray-400" />
            <span className="font-bold text-gray-500 text-sm dark:text-gray-400">
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
            <span className="text-gray-500 text-sm dark:text-gray-400">
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

          <span className="text-gray-500 text-sm dark:text-gray-400">
            <FormattedMessage
              id="general.service_not_started"
              defaultMessage="Service on this day has not started."
            />
          </span>

          <Popover.Arrow className="fill-gray-300 dark:fill-gray-600" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
