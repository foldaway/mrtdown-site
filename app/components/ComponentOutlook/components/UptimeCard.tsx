import { InformationCircleIcon } from '@heroicons/react/24/outline';
import * as Popover from '@radix-ui/react-popover';
import { type DateTime, Duration } from 'luxon';
import { useMemo, useState } from 'react';
import { FormattedMessage, FormattedNumber } from 'react-intl';
import { useDebounce } from 'use-debounce';
import { FormattedDuration } from '~/components/FormattedDuration';
import type { DateSummary, IssueType } from '../../../types';

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

  const {
    total: downtimeDuration,
    disruption: downtimeDurationDisruption,
    maintenance: downtimeDurationMaintenance,
  } = useMemo(() => {
    let durationTotal = Duration.fromObject({ milliseconds: 0 });
    let durationDisruption = Duration.fromObject({ milliseconds: 0 });
    let durationMaintenance = Duration.fromObject({ milliseconds: 0 });

    for (const dateTime of dateTimes) {
      const dateOverview = dates[dateTime.toISODate()] ?? DATE_OVERVIEW_DEFAULT;

      for (const [issueType, durationMs] of Object.entries(
        dateOverview.issueTypesDurationMs,
      )) {
        switch (issueType as IssueType) {
          case 'disruption': {
            durationTotal = durationTotal.plus({
              milliseconds: durationMs,
            });
            durationDisruption = durationDisruption.plus({
              milliseconds: durationMs,
            });
            break;
          }
          case 'maintenance': {
            durationTotal = durationTotal.plus({
              milliseconds: durationMs,
            });
            durationMaintenance = durationMaintenance.plus({
              milliseconds: durationMs,
            });
            break;
          }
          case 'infra': {
            // Don't include infra issues in downtime calculation
            break;
          }
        }
      }
    }

    return {
      total: durationTotal.rescale(),
      disruption: durationDisruption.rescale(),
      maintenance: durationMaintenance.rescale(),
    };
  }, [dateTimes, dates]);

  const percentage = downtimeDuration.toMillis() / totalDuration.toMillis();

  return (
    <>
      <span className="text-gray-500 text-xs dark:text-gray-400">
        <FormattedMessage
          id="general.uptime_percent_display"
          defaultMessage="{percent} uptime"
          values={{
            percent: (
              <FormattedNumber
                value={1 - percentage}
                style="percent"
                maximumFractionDigits={2}
              />
            ),
          }}
        />
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
                <FormattedMessage
                  id="general.uptime_duration_display"
                  defaultMessage="{duration} within service hours"
                  values={{
                    duration: <FormattedDuration duration={downtimeDuration} />,
                  }}
                />
              </span>

              <table className="mt-1 table-auto text-gray-500 text-xs dark:text-gray-400">
                <tbody>
                  <tr>
                    <td>
                      <div className="flex items-center py-0.5 pe-1">
                        <div className="me-1 size-3 rounded-full bg-disruption-light hover:opacity-55 dark:bg-disruption-dark" />
                        <span className="text-xs">
                          <FormattedMessage
                            id="general.disruption"
                            defaultMessage="Disruption"
                          />
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs">
                        <FormattedDuration
                          duration={downtimeDurationDisruption}
                        />
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="flex items-center py-0.5 pe-1">
                        <div className="me-1 size-3 rounded-full bg-maintenance-light hover:opacity-55 dark:bg-maintenance-dark" />
                        <span className="text-xs">
                          <FormattedMessage
                            id="general.maintenance"
                            defaultMessage="Maintenance"
                          />
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs">
                        <FormattedDuration
                          duration={downtimeDurationMaintenance}
                        />
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div className="flex items-center py-0.5 pe-1">
                        <div className="me-1 size-3 rounded-full bg-infra-light hover:opacity-55 dark:bg-infra-dark" />
                        <span className="text-xs">
                          <FormattedMessage
                            id="general.infra"
                            defaultMessage="Infrastructure"
                          />
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="text-xs">-</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </>
  );
};
