import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { Duration } from 'luxon';
import { Popover } from '../../BaseUI';
import { useState } from 'react';
import { FormattedMessage, FormattedNumber } from 'react-intl';
import { useDebounce } from 'use-debounce';
import { FormattedDuration } from '~/components/FormattedDuration';
import type { LineSummary } from '~/types';
import { assert } from '~/util/assert';

interface Props {
  data: Pick<
    LineSummary,
    | 'uptimeRatio'
    | 'totalDowntimeSeconds'
    | 'totalServiceSeconds'
    | 'downtimeBreakdown'
  >;
}

export const UptimeCard: React.FC<Props> = (props) => {
  const { data } = props;
  assert(data.uptimeRatio != null);

  const [isOpen, setIsOpen] = useState(false);
  const [isOpenDebounced] = useDebounce(isOpen, 100);
  const disruptionDowntimeSeconds =
    data.downtimeBreakdown?.find((breakdown) => breakdown.type === 'disruption')
      ?.downtimeSeconds ?? 0;
  const disruptionDowntimeRatio =
    data.totalServiceSeconds != null && data.totalServiceSeconds > 0
      ? disruptionDowntimeSeconds / data.totalServiceSeconds
      : 0;
  const disruptionDowntimeDuration = Duration.fromObject({
    minutes: Math.floor(disruptionDowntimeSeconds / 60),
  });

  return (
    <>
      <span className="font-medium text-gray-600 text-xs dark:text-gray-300">
        <FormattedMessage
          id="general.uptime_percent_display"
          defaultMessage="{percent} uptime"
          values={{
            percent: (
              <FormattedNumber
                value={data.uptimeRatio}
                style="percent"
                maximumFractionDigits={2}
              />
            ),
          }}
        />
      </span>
      {data.totalDowntimeSeconds != null && (
        <Popover.Root open={isOpenDebounced} onOpenChange={setIsOpen}>
          <Popover.Trigger
            type="button"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
            className="ms-1 rounded-full p-0.5 transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-accent-light focus-visible:outline-offset-2 dark:focus-visible:outline-accent-dark dark:hover:bg-gray-700"
          >
            <InformationCircleIcon
              aria-hidden="true"
              className="size-4 text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
            />
            <span className="sr-only">
              <FormattedMessage
                id="general.disruption_downtime"
                defaultMessage="Disruption downtime"
              />
            </span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-gray-900/15 shadow-xl outline-none ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/30 dark:ring-white/10"
              onMouseEnter={() => setIsOpen(true)}
              onMouseLeave={() => setIsOpen(false)}
              collisionPadding={16}
              side="top"
              sideOffset={8}
            >
              <Popover.Arrow className="fill-white dark:fill-gray-800" />

              <span className="font-semibold text-gray-900 text-sm dark:text-gray-100">
                <FormattedMessage
                  id="general.disruption_downtime"
                  defaultMessage="Disruption downtime"
                />
              </span>

              <div className="mt-3 flex items-center justify-between gap-x-4">
                <span className="font-semibold text-disruption-light text-xl tabular-nums leading-tight dark:text-disruption-dark">
                  <FormattedDuration duration={disruptionDowntimeDuration} />
                </span>
                <span className="flex shrink-0 flex-col items-end text-xs">
                  <span className="font-semibold text-disruption-light tabular-nums dark:text-disruption-dark">
                    <FormattedNumber
                      value={disruptionDowntimeRatio}
                      style="percent"
                      maximumFractionDigits={2}
                    />
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">
                    <FormattedMessage
                      id="general.of_service_hours"
                      defaultMessage="of service hours"
                    />
                  </span>
                </span>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </>
  );
};
