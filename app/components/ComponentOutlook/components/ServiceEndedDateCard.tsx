import * as Popover from '@radix-ui/react-popover';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useHydrated } from '../../../hooks/useHydrated';

interface Props {
  dateTime: DateTime;
}

export const ServiceEndedDateCard: React.FC<Props> = (props) => {
  const { dateTime } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [isOpenDebounced] = useDebounce(isOpen, 100);

  const isHydrated = useHydrated();

  return (
    <Popover.Root open={isOpenDebounced} onOpenChange={setIsOpen}>
      <Popover.Trigger
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="outline-none"
      >
        <div className="h-7 w-1.5 rounded-xs transition-transform hover:scale-150 bg-gray-400 dark:bg-gray-600" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="flex w-64 flex-col rounded border border-gray-300 bg-gray-100 px-4 py-2 outline-none dark:border-gray-600 dark:bg-gray-700"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <span className="font-bold text-gray-600 text-sm dark:text-gray-300">
            {isHydrated
              ? dateTime.toLocaleString(DateTime.DATE_FULL)
              : dateTime.toISO()}
          </span>

          <span className="text-gray-500 text-sm dark:text-gray-400">
            Service on this day has not started.
          </span>

          <Popover.Arrow className="fill-gray-300 dark:fill-gray-600" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
