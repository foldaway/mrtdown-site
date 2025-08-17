import { InformationCircleIcon } from '@heroicons/react/24/outline';
import classNames from 'classnames';
import { type DateTime, Duration } from 'luxon';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import {
  defineMessage,
  FormattedMessage,
  FormattedNumber,
  type MessageDescriptor,
} from 'react-intl';
import { useDebounce } from 'use-debounce';
import type { ComponentStatusSummary } from '~/client';
import { FormattedDuration } from '~/components/FormattedDuration';
import type { IssueType } from '~/types';
import { assert } from '~/util/assert';

const ISSUE_TYPE_MESSAGE_DESCRIPTORS: Record<IssueType, MessageDescriptor> = {
  disruption: defineMessage({
    id: 'general.disruption',
    defaultMessage: 'Disruption',
  }),
  maintenance: defineMessage({
    id: 'general.maintenance',
    defaultMessage: 'Maintenance',
  }),
  infra: defineMessage({
    id: 'general.infrastructure',
    defaultMessage: 'Infrastructure',
  }),
};

interface Props {
  data: Pick<
    ComponentStatusSummary,
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
      <span className="text-gray-500 text-xs dark:text-gray-400">
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

              <table className="mt-1 table-auto text-gray-500 text-xs dark:text-gray-400">
                <tbody>
                  {data.downtimeBreakdown?.map((breakdown) => (
                    <tr key={breakdown.type}>
                      <td>
                        <div className="flex items-center py-0.5 pe-1">
                          <div
                            className={classNames(
                              'me-1 size-3 rounded-full hover:opacity-55',
                              {
                                'bg-disruption-light dark:bg-disruption-dark':
                                  breakdown.type === 'disruption',
                                'bg-maintenance-light dark:bg-maintenance-dark':
                                  breakdown.type === 'maintenance',
                                'bg-infra-light dark:bg-infra-dark':
                                  breakdown.type === 'infra',
                              },
                            )}
                          />
                          <span className="text-xs">
                            <FormattedMessage
                              {...ISSUE_TYPE_MESSAGE_DESCRIPTORS[
                                breakdown.type
                              ]}
                            />
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="text-xs">
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
                    <tr>
                      <td>
                        <div className="flex items-center py-0.5 pe-1">
                          <div className="me-1 size-3 rounded-full bg-infra-light hover:opacity-55 dark:bg-infra-dark" />
                          <span className="text-xs">
                            <FormattedMessage
                              id="general.infrastructure"
                              defaultMessage="Infrastructure"
                            />
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="text-xs">-</span>
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
