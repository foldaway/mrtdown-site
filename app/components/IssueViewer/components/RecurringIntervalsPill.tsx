import type { Interval } from 'luxon';
import { Popover } from 'radix-ui';
import type React from 'react';
import { FormattedDateTimeRange, FormattedNumber } from 'react-intl';
import { useHydrated } from '~/hooks/useHydrated';

interface Props {
  intervals: Interval[];
}

export const RecurringIntervalsPill: React.FC<Props> = (props) => {
  const { intervals } = props;

  const isHydrated = useHydrated();

  return (
    <Popover.Root>
      <Popover.Trigger className="ms-1 rounded-lg bg-gray-300 px-1.5 py-0.5 hover:cursor-pointer hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600">
        <FormattedNumber value={intervals.length} />x
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="flex max-h-96 flex-col overflow-y-scroll rounded border border-gray-300 bg-gray-100 py-2 outline-none dark:border-gray-600 dark:bg-gray-800">
          <Popover.Arrow className="fill-gray-300 dark:fill-gray-800" />

          {intervals.map((interval) => (
            <div
              key={interval.toISO()}
              className="px-4 py-1.5 text-gray-600 text-xs even:bg-gray-200 dark:text-gray-300 dark:even:bg-gray-700"
            >
              {isHydrated ? (
                <span className="truncate font-bold text-gray-500 text-xs dark:border-gray-300 dark:text-gray-400">
                  <FormattedDateTimeRange
                    from={interval.start.toJSDate()}
                    to={interval.end.toJSDate()}
                    month="short"
                    day="numeric"
                    year="numeric"
                    hour="numeric"
                    minute="numeric"
                  />
                </span>
              ) : (
                interval.toISO()
              )}
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
