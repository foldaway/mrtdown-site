import { ClockIcon } from '@heroicons/react/24/outline';
import classNames from 'classnames';
import { type DateTime, Duration } from 'luxon';
import { Popover } from 'radix-ui';
import { Fragment, useMemo, useState } from 'react';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { useDebounce } from 'use-debounce';
import type {
  Issue,
  Line,
  LineSummaryDateRecord,
  LineSummaryStatus,
} from '~/client';
import { FormattedDuration } from '~/components/FormattedDuration';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useHydrated } from '../../../hooks/useHydrated';
import { DAY_TYPE_MESSAGE_DESCRIPTORS } from '../constants';
import { useOperatingHours } from '../hooks/useOperatingHours';

const DAY_IN_SECONDS = 24 * 60 * 60;

interface Segment {
  percentage: number;
  type: LineSummaryStatus;
}

interface Props {
  line: Line;
  issues: Record<string, Issue>;
  dateTime: DateTime;
  data: LineSummaryDateRecord;
}

export const DateCard: React.FC<Props> = (props) => {
  const { line, dateTime, data, issues } = props;
  const { breakdownByIssueTypes, dayType } = data;

  const [isOpen, setIsOpen] = useState(false);
  const [isOpenDebounced] = useDebounce(isOpen, 100);

  const isHydrated = useHydrated();
  const intl = useIntl();

  const operatingHours = useOperatingHours(line, dateTime, dayType);

  const notInServiceDuration = useMemo(() => {
    const startOfDay = dateTime.startOf('day');
    const endOfDay = startOfDay.plus({ days: 1 });

    let duration = Duration.fromMillis(0);

    if (operatingHours.start > startOfDay) {
      duration = duration.plus(operatingHours.start.diff(startOfDay));
    }

    if (operatingHours.end < endOfDay) {
      duration = duration.plus(endOfDay.diff(operatingHours.end));
    }

    return duration;
  }, [dateTime, operatingHours]);

  const segments = useMemo<Segment[]>(() => {
    const results: Segment[] = [];

    if (notInServiceDuration.as('seconds') > 0) {
      const notInServiceSegment: Segment = {
        percentage: notInServiceDuration.as('seconds') / DAY_IN_SECONDS,
        type: 'closed_for_day',
      };
      results.push(notInServiceSegment);
    }

    for (const [issueType, entry] of Object.entries(breakdownByIssueTypes).sort(
      (a, b) => a[1].totalDurationSeconds - b[1].totalDurationSeconds,
    )) {
      const percentage = Math.max(
        entry.totalDurationSeconds / DAY_IN_SECONDS,
        0.15,
      );
      if (percentage > 0) {
        results.push({
          percentage,
          type: `ongoing_${issueType}` as LineSummaryStatus,
        });
      }
    }

    return results;
  }, [breakdownByIssueTypes, notInServiceDuration]);

  return (
    <Popover.Root open={isOpenDebounced} onOpenChange={setIsOpen}>
      <Popover.Trigger
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="group cursor-pointer rounded-sm transition-all duration-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-1 dark:focus:ring-accent-dark dark:hover:bg-gray-800"
      >
        <div className="flex h-7 w-1.5 flex-col-reverse overflow-hidden rounded-xs bg-operational-light shadow-sm transition-all duration-200 group-hover:scale-125 group-hover:shadow-md group-focus:scale-125 dark:bg-operational-dark">
          {segments.map((segment) => (
            <div
              key={segment.type}
              className={classNames('flex w-1.5', {
                'bg-disruption-light dark:bg-disruption-dark':
                  segment.type === 'ongoing_disruption',
                'bg-maintenance-light dark:bg-maintenance-dark':
                  segment.type === 'ongoing_maintenance',
                'bg-infra-light dark:bg-infra-dark':
                  segment.type === 'ongoing_infra',
                'bg-gray-400 dark:bg-gray-600':
                  segment.type === 'closed_for_day',
              })}
              style={{
                height: `${(segment.percentage * 100).toFixed(1)}%`,
              }}
            />
          ))}
        </div>
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
                day="numeric"
                month="long"
                year="numeric"
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

          {notInServiceDuration.as('seconds') > 0 && (
            <div className="flex items-center py-1">
              <div className="me-2 size-3 rounded-full bg-gray-400 dark:bg-gray-600" />
              <span className="font-medium text-gray-700 text-sm capitalize dark:text-gray-200">
                <FormattedMessage
                  id="status.service_ended"
                  defaultMessage="Service Ended"
                />
              </span>
              <span className="ms-auto text-gray-600 text-sm dark:text-gray-300">
                {isHydrated ? (
                  <FormattedDuration
                    duration={notInServiceDuration.rescale()}
                  />
                ) : (
                  notInServiceDuration.toISO()
                )}
              </span>
            </div>
          )}

          {Object.entries(breakdownByIssueTypes).map(([key, entry]) => {
            const issueType = key as Issue['type'];
            return (
              <div key={issueType} className="flex items-center py-1">
                <div
                  className={classNames('me-2 size-3 rounded-full', {
                    'bg-disruption-light dark:bg-disruption-dark':
                      issueType === 'disruption',
                    'bg-maintenance-light dark:bg-maintenance-dark':
                      issueType === 'maintenance',
                    'bg-infra-light dark:bg-infra-dark': issueType === 'infra',
                  })}
                />
                <span className="font-medium text-gray-700 text-sm capitalize dark:text-gray-200">
                  {issueType === 'disruption' && (
                    <FormattedMessage
                      id="general.disruption"
                      defaultMessage="Disruption"
                    />
                  )}
                  {issueType === 'maintenance' && (
                    <FormattedMessage
                      id="general.maintenance"
                      defaultMessage="Maintenance"
                    />
                  )}
                  {issueType === 'infra' && (
                    <FormattedMessage
                      id="general.infrastructure"
                      defaultMessage="Infrastructure"
                    />
                  )}
                </span>
                <span className="ms-auto text-gray-600 text-sm dark:text-gray-300">
                  {isHydrated ? (
                    <FormattedDuration
                      duration={Duration.fromObject({
                        seconds: entry.totalDurationSeconds,
                      })
                        .rescale()
                        .set({ seconds: 0 })
                        .rescale()}
                    />
                  ) : (
                    Duration.fromObject({
                      seconds: entry.totalDurationSeconds,
                    }).toISO()
                  )}
                </span>
              </div>
            );
          })}

          <div className="mt-4 mb-2 border-gray-200 border-t pt-3 dark:border-gray-600">
            <span className="font-medium text-gray-500 text-xs uppercase tracking-wide dark:text-gray-400">
              <FormattedMessage id="general.related" defaultMessage="Related" />
            </span>
          </div>
          {Object.keys(breakdownByIssueTypes).length === 0 && (
            <span className="text-gray-600 text-sm italic dark:text-gray-300">
              <FormattedMessage
                id="general.no_downtime_on_this_day"
                defaultMessage="No downtime recorded on this day."
              />
            </span>
          )}
          <div className="flex flex-col gap-y-2">
            {Object.entries(breakdownByIssueTypes).map(([issueType, entry]) => (
              <Fragment key={issueType}>
                {entry.issueIds.map((issueId) => {
                  const issueRef = issues[issueId];
                  return (
                    <Link
                      key={issueRef.id}
                      to={buildLocaleAwareLink(
                        `/issues/${issueRef.id}`,
                        intl.locale,
                      )}
                      className="flex items-center gap-x-2 rounded-md px-2 py-1.5 text-gray-700 text-sm transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent-light dark:text-gray-200 dark:focus:ring-accent-dark dark:hover:bg-gray-700 dark:hover:text-gray-100"
                    >
                      <div
                        className={classNames('size-3 shrink-0 rounded-full', {
                          'bg-disruption-light dark:bg-disruption-dark':
                            issueType === 'disruption',
                          'bg-maintenance-light dark:bg-maintenance-dark':
                            issueType === 'maintenance',
                          'bg-infra-light dark:bg-infra-dark':
                            issueType === 'infra',
                        })}
                      />
                      <span className="leading-tight">
                        {issueRef.titleTranslations[intl.locale] ??
                          issueRef.title}
                      </span>
                    </Link>
                  );
                })}
              </Fragment>
            ))}
          </div>
          <Popover.Arrow className="fill-white dark:fill-gray-800" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
