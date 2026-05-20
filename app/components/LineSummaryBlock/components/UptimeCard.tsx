import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { Duration } from 'luxon';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { FormattedMessage, FormattedNumber } from 'react-intl';
import { useDebounce } from 'use-debounce';
import type { LineSummary } from '~/client';
import { FormattedDuration } from '~/components/FormattedDuration';
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
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
            className="ms-1 rounded-full p-0.5 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-1 dark:focus:ring-accent-dark dark:hover:bg-gray-700"
          >
            <InformationCircleIcon className="size-4 text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-50 flex min-w-64 max-w-80 flex-col rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg outline-none ring-1 ring-black/5 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800 dark:ring-white/10"
              onMouseEnter={() => setIsOpen(true)}
              onMouseLeave={() => setIsOpen(false)}
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

              <div className="mt-3 flex items-end justify-between gap-x-4">
                <span className="font-semibold text-2xl text-disruption-light tabular-nums dark:text-disruption-dark">
                  <FormattedDuration
                    duration={Duration.fromObject({
                      seconds: disruptionDowntimeSeconds,
                    })}
                  />
                </span>
                <span className="pb-1 text-gray-500 text-xs dark:text-gray-400">
                  <FormattedMessage
                    id="general.service_hours_share"
                    defaultMessage="{percent} of service hours"
                    values={{
                      percent: (
                        <FormattedNumber
                          value={disruptionDowntimeRatio}
                          style="percent"
                          maximumFractionDigits={2}
                        />
                      ),
                    }}
                  />
                </span>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-disruption-light dark:bg-disruption-dark"
                  style={{
                    width: `${Math.min(disruptionDowntimeRatio * 100, 100).toFixed(2)}%`,
                  }}
                />
              </div>

              <span className="mt-3 text-gray-600 text-xs leading-relaxed dark:text-gray-300">
                {disruptionDowntimeSeconds > 0 ? (
                  <FormattedMessage
                    id="general.disruption_downtime_description"
                    defaultMessage="Disruption time counted against uptime for this period."
                  />
                ) : (
                  <FormattedMessage
                    id="general.no_disruption_downtime_description"
                    defaultMessage="No disruption downtime recorded in this period."
                  />
                )}
              </span>

              <div className="mt-3 flex items-center justify-between border-gray-100 border-t pt-3 text-xs dark:border-gray-700">
                <div className="flex items-center">
                  <div className="me-2 size-3 rounded-full bg-disruption-light dark:bg-disruption-dark" />
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    <FormattedMessage
                      id="general.disruption"
                      defaultMessage="Disruption"
                    />
                  </span>
                </div>
                <span className="font-mono text-gray-600 dark:text-gray-300">
                  <FormattedDuration
                    duration={Duration.fromObject({
                      seconds: disruptionDowntimeSeconds,
                    })}
                  />
                </span>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </>
  );
};
