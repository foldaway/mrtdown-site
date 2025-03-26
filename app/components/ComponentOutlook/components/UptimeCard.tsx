import { InformationCircleIcon } from '@heroicons/react/24/outline';
import * as Popover from '@radix-ui/react-popover';
import { type DateTime, Duration } from 'luxon';
import { useMemo, useState } from 'react';
import { useDebounce } from 'use-debounce';
import type { DateSummary } from '../../../types';

const DATE_OVERVIEW_DEFAULT: DateSummary = {
  issueTypesDurationMs: {},
  issues: [],
  componentIdsIssueTypesDurationMs: {},
};

interface Props {
  dateTimes: DateTime<true>[];
  dates: Record<string, DateSummary>;
}

export const UptimeCard: React.FC<Props> = (props) => {
  const { dateTimes, dates } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [isOpenDebounced] = useDebounce(isOpen, 100);

  const totalDuration = useMemo(() => {
    // Account for service hours, 5:30 AM - 12 midnight
    return Duration.fromObject({
      hours: 18.5 * dateTimes.length,
    }).rescale();
  }, [dateTimes.length]);

  const downtimeDuration = useMemo(() => {
    let duration = Duration.fromObject({ milliseconds: 0 });

    for (const dateTime of dateTimes) {
      const dateOverview = dates[dateTime.toISODate()] ?? DATE_OVERVIEW_DEFAULT;

      for (const durationMs of Object.values(
        dateOverview.issueTypesDurationMs,
      )) {
        duration = duration.plus({
          milliseconds: durationMs,
        });
      }
    }

    return duration.rescale();
  }, [dateTimes, dates]);

  const percentage = downtimeDuration.toMillis() / totalDuration.toMillis();

  const uptimeFormatted = new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(1 - percentage);

  return (
    <>
      <span className="text-gray-500 text-xs dark:text-gray-400">
        {uptimeFormatted} uptime
      </span>
      {downtimeDuration.toMillis() > 0 && (
        <Popover.Root open={isOpenDebounced} onOpenChange={setIsOpen}>
          <Popover.Trigger
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
            className="ms-0.5"
          >
            <InformationCircleIcon className="size-4 text-gray-500 dark:text-gray-400" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="flex flex-col rounded border border-gray-300 bg-gray-100 px-4 py-2 outline-none dark:border-gray-600 dark:bg-gray-700"
              onMouseEnter={() => setIsOpen(true)}
              onMouseLeave={() => setIsOpen(false)}
            >
              <Popover.Arrow className="fill-gray-300 dark:fill-gray-600" />

              <span className="text-gray-600 text-xs dark:text-gray-300">
                {downtimeDuration.toHuman({ unitDisplay: 'short' })} of downtime
                within service hours
              </span>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </>
  );
};
