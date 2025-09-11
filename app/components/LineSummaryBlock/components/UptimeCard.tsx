import { InformationCircleIcon } from '@heroicons/react/24/outline';
import classNames from 'classnames';
import { type DateTime, Duration } from 'luxon';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { FormattedMessage, FormattedNumber } from 'react-intl';
import { useDebounce } from 'use-debounce';
import type { LineSummary } from '~/client';
import { FormattedDuration } from '~/components/FormattedDuration';
import { IssueTypeLabels } from '~/constants';
import { assert } from '~/util/assert';

interface Props {
  data: Pick<
    LineSummary,
    | 'durationSecondsByIssueType'
    | 'durationSecondsTotalForIssues'
    | 'uptimeRatio'
    | 'totalDowntimeSeconds'
    | 'totalServiceSeconds'
    | 'downtimeBreakdown'
  >;
  dateTimes: DateTime<true>[];
}

export const UptimeCard: React.FC<Props> = (props) => {
  const { data } = props;
  assert(data.uptimeRatio != null);

  const [isOpen, setIsOpen] = useState(false);
  const [isOpenDebounced] = useDebounce(isOpen, 100);

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

              <span className="mb-2 font-medium text-gray-800 text-sm dark:text-gray-100">
                <FormattedMessage
                  id="general.uptime_duration_display"
                  defaultMessage="{duration} within service hours"
                  values={{
                    duration: (
                      <FormattedDuration
                        duration={Duration.fromObject({
                          seconds: data.totalDowntimeSeconds,
                        })}
                      />
                    ),
                  }}
                />
              </span>

              <table className="w-full table-auto text-gray-600 text-xs dark:text-gray-300">
                <tbody>
                  {data.downtimeBreakdown?.map((breakdown) => (
                    <tr
                      key={breakdown.type}
                      className="border-gray-100 border-b last:border-b-0 dark:border-gray-700"
                    >
                      <td className="py-2">
                        <div className="flex items-center">
                          <div
                            className={classNames('me-2 size-3 rounded-full', {
                              'bg-disruption-light dark:bg-disruption-dark':
                                breakdown.type === 'disruption',
                              'bg-maintenance-light dark:bg-maintenance-dark':
                                breakdown.type === 'maintenance',
                              'bg-infra-light dark:bg-infra-dark':
                                breakdown.type === 'infra',
                            })}
                          />
                          <span className="font-medium text-xs">
                            <FormattedMessage
                              {...IssueTypeLabels[breakdown.type]}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <span className="font-mono text-xs">
                          <FormattedDuration
                            duration={Duration.fromObject({
                              seconds: breakdown.downtimeSeconds,
                            })}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                  {'infra' in data.durationSecondsByIssueType && (
                    <tr className="border-gray-100 border-b last:border-b-0 dark:border-gray-700">
                      <td className="py-2">
                        <div className="flex items-center">
                          <div className="me-2 size-3 rounded-full bg-infra-light dark:bg-infra-dark" />
                          <span className="font-medium text-xs">
                            <FormattedMessage
                              id="general.infrastructure"
                              defaultMessage="Infrastructure"
                            />
                          </span>
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <span className="font-mono text-gray-400 text-xs dark:text-gray-500">
                          -
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </>
  );
};
