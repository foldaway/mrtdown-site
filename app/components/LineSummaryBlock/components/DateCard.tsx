import { CalendarDaysIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { DateTime, Duration } from 'luxon';
import { Tooltip } from '@base-ui/react/tooltip';
import { Fragment, useMemo } from 'react';
import {
  FormattedDate,
  FormattedMessage,
  FormattedNumber,
  FormattedTime,
  type IntlShape,
  useIntl,
} from 'react-intl';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type {
  Issue,
  Line,
  LineSummaryDateRecord,
  LineSummaryStatus,
} from '~/types';
import { DAY_TYPE_MESSAGE_DESCRIPTORS } from '../constants';
import { getOrderedIssueTypeBreakdowns } from '../helpers/orderIssueTypeBreakdowns';
import { useOperatingHours } from '../hooks/useOperatingHours';

const DAY_IN_SECONDS = 24 * 60 * 60;
const SINGAPORE_TIME_ZONE = 'Asia/Singapore';

interface Segment {
  percentage: number;
  type: LineSummaryStatus;
}

interface Props {
  line: Line;
  issues: Record<string, Issue>;
  dateTime: DateTime;
  data: LineSummaryDateRecord;
  isActive: boolean;
  onActivate: () => void;
}

interface DetailsProps extends Omit<Props, 'isActive' | 'onActivate'> {
  onClose: () => void;
}

interface TimelineInterval {
  start: DateTime;
  end: DateTime;
}

function CompactDuration(props: { duration: Duration }) {
  const totalMinutes = Math.max(0, Math.round(props.duration.as('minutes')));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return (
    <>
      {hours > 0 && (
        <FormattedNumber
          value={hours}
          style="unit"
          unit="hour"
          unitDisplay="narrow"
        />
      )}
      {hours > 0 && minutes > 0 && ' '}
      {(minutes > 0 || hours === 0) && (
        <FormattedNumber
          value={minutes}
          style="unit"
          unit="minute"
          unitDisplay="narrow"
        />
      )}
    </>
  );
}

function getTimelinePosition(
  value: DateTime,
  timelineStart: DateTime,
  timelineEnd: DateTime,
) {
  const timelineMillis = timelineEnd.toMillis() - timelineStart.toMillis();
  if (timelineMillis <= 0) {
    return 0;
  }
  return Math.min(
    1,
    Math.max(0, (value.toMillis() - timelineStart.toMillis()) / timelineMillis),
  );
}

function formatSingaporeTimeRange(
  intl: IntlShape,
  start: DateTime,
  end: DateTime,
) {
  return intl.formatMessage(
    {
      id: 'component.service_hours_description',
      defaultMessage: '{start} to {end}',
    },
    {
      start: intl.formatTime(start.toJSDate(), {
        timeStyle: 'short',
        timeZone: SINGAPORE_TIME_ZONE,
      }),
      end: intl.formatTime(end.toJSDate(), {
        timeStyle: 'short',
        timeZone: SINGAPORE_TIME_ZONE,
      }),
    },
  );
}

function TimelineLane(props: {
  intervals: TimelineInterval[];
  label: string;
  duration: Duration;
  type: LineSummaryStatus;
  timelineStart: DateTime;
  timelineEnd: DateTime;
}) {
  const { intervals, label, duration, type, timelineStart, timelineEnd } =
    props;
  const intl = useIntl();
  const markerClassName = classNames({
    'bg-gray-500 dark:bg-gray-400': type === 'closed_for_day',
    'bg-disruption-light dark:bg-disruption-dark':
      type === 'ongoing_disruption',
    'bg-maintenance-light dark:bg-maintenance-dark':
      type === 'ongoing_maintenance',
    'bg-infra-light dark:bg-infra-dark': type === 'ongoing_infra',
  });

  return (
    <div className="grid gap-1.5 sm:grid-cols-[minmax(10rem,_13rem)_minmax(0,_1fr)] sm:items-center sm:gap-x-4">
      <div className="flex min-w-0 items-center justify-between gap-x-3">
        <span className="flex min-w-0 items-center gap-x-2 font-medium text-gray-700 dark:text-gray-200">
          <span
            className={classNames(
              'size-2.5 shrink-0 rounded-full',
              markerClassName,
            )}
          />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 text-gray-500 text-xs tabular-nums dark:text-gray-400">
          <CompactDuration duration={duration} />
        </span>
      </div>
      <Tooltip.Provider delay={100}>
        <div className="relative h-4 overflow-hidden rounded-sm bg-gray-200 dark:bg-gray-700">
          {intervals.map((interval) => {
            const start = getTimelinePosition(
              interval.start,
              timelineStart,
              timelineEnd,
            );
            const end = getTimelinePosition(
              interval.end,
              timelineStart,
              timelineEnd,
            );
            const intervalTime = formatSingaporeTimeRange(
              intl,
              interval.start,
              interval.end,
            );

            return (
              <Tooltip.Root
                key={`${interval.start.toISO()}-${interval.end.toISO()}`}
              >
                <Tooltip.Trigger
                  render={
                    <button
                      type="button"
                      aria-label={`${label}: ${intervalTime}`}
                      className={classNames(
                        'absolute inset-y-0 min-w-px cursor-help border-0 p-0 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-[-2px]',
                        markerClassName,
                      )}
                      style={{
                        left: `${(start * 100).toFixed(3)}%`,
                        width: `${(Math.max(0, end - start) * 100).toFixed(3)}%`,
                      }}
                    />
                  }
                />
                <Tooltip.Portal>
                  <Tooltip.Positioner sideOffset={4}>
                    <Tooltip.Popup className="z-50 rounded-md bg-gray-900 px-3 py-2 font-medium text-white text-xs shadow-lg dark:bg-gray-700">
                      {intervalTime}
                      <Tooltip.Arrow className="fill-gray-900 dark:fill-gray-700" />
                    </Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          })}
        </div>
      </Tooltip.Provider>
    </div>
  );
}

function useDateBreakdown(
  line: Line,
  dateTime: DateTime,
  data: LineSummaryDateRecord,
) {
  const { breakdownByIssueTypes, dayType } = data;

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

    for (const [issueType, entry] of getOrderedIssueTypeBreakdowns(
      breakdownByIssueTypes,
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

  return { operatingHours, notInServiceDuration, segments };
}

export const DateCard: React.FC<Props> = (props) => {
  const { line, dateTime, data } = props;
  const { segments } = useDateBreakdown(line, dateTime, data);
  const intl = useIntl();
  const isoDate = dateTime.toISODate();
  const ariaLabel =
    isoDate == null
      ? undefined
      : intl.formatMessage(
          {
            id: 'component.view_details_for_date',
            defaultMessage: 'View details for {date}',
          },
          { date: isoDate },
        );

  return (
    <button
      type="button"
      onClick={props.onActivate}
      aria-label={ariaLabel}
      aria-expanded={props.isActive}
      className={classNames(
        'group hover:-translate-y-0.5 flex h-9 min-w-0 cursor-pointer items-center justify-center rounded-sm transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-light focus-visible:ring-offset-1 active:translate-y-0 active:scale-95 dark:focus-visible:ring-accent-dark',
        {
          'bg-accent-light/10 shadow-inner dark:bg-accent-dark/15':
            props.isActive,
        },
      )}
    >
      <div
        className={classNames(
          'flex w-full flex-col-reverse overflow-hidden rounded-xs bg-operational-light transition-all duration-150 group-hover:scale-105 group-hover:brightness-110 group-focus-visible:scale-105 dark:bg-operational-dark',
          props.isActive ? 'h-9 brightness-110' : 'h-7',
        )}
      >
        {segments.map((segment) => (
          <div
            key={segment.type}
            className={classNames('flex w-full', {
              'bg-disruption-light dark:bg-disruption-dark':
                segment.type === 'ongoing_disruption',
              'bg-maintenance-light dark:bg-maintenance-dark':
                segment.type === 'ongoing_maintenance',
              'bg-infra-light dark:bg-infra-dark':
                segment.type === 'ongoing_infra',
              'bg-gray-400 dark:bg-gray-600': segment.type === 'closed_for_day',
            })}
            style={{
              height: `${(segment.percentage * 100).toFixed(1)}%`,
            }}
          />
        ))}
      </div>
    </button>
  );
};

export const DateCardDetails: React.FC<DetailsProps> = (props) => {
  const { line, dateTime, data, issues, onClose } = props;
  const { breakdownByIssueTypes, dayType } = data;

  const intl = useIntl();
  const orderedIssueTypeBreakdowns = getOrderedIssueTypeBreakdowns(
    breakdownByIssueTypes,
  );
  const { operatingHours, notInServiceDuration } = useDateBreakdown(
    line,
    dateTime,
    data,
  );
  const timelineStart = dateTime.startOf('day');
  const timelineEnd = DateTime.max(
    timelineStart.plus({ days: 1 }),
    operatingHours.end,
  );
  const offHoursIntervals: TimelineInterval[] = [];
  if (operatingHours.start > timelineStart) {
    offHoursIntervals.push({
      start: timelineStart,
      end: DateTime.min(operatingHours.start, timelineEnd),
    });
  }
  if (operatingHours.end < timelineEnd) {
    offHoursIntervals.push({
      start: DateTime.max(operatingHours.end, timelineStart),
      end: timelineEnd,
    });
  }
  const timelineMillis = timelineEnd.toMillis() - timelineStart.toMillis();
  const axisTimes = Array.from({ length: 5 }, (_, index) =>
    timelineStart.plus({ milliseconds: (timelineMillis * index) / 4 }),
  );
  const hasIssueBreakdowns = orderedIssueTypeBreakdowns.length > 0;

  return (
    <div className="flex flex-col text-sm">
      <div className="grid grid-cols-[minmax(0,_1fr)_auto] items-start gap-x-3 pb-3">
        <div className="flex min-w-0 items-start gap-x-3">
          <CalendarDaysIcon className="mt-0.5 size-5 shrink-0 text-gray-500 dark:text-gray-400" />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 leading-tight dark:text-gray-100">
              <FormattedDate
                value={dateTime.toJSDate()}
                day="numeric"
                month="long"
                year="numeric"
                weekday="long"
                timeZone={SINGAPORE_TIME_ZONE}
              />
            </p>
            <p className="mt-1 text-gray-500 text-xs dark:text-gray-400">
              {formatSingaporeTimeRange(
                intl,
                operatingHours.start,
                operatingHours.end,
              )}{' '}
              · <FormattedMessage {...DAY_TYPE_MESSAGE_DESCRIPTORS[dayType]} />{' '}
              · SGT (UTC+8)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-x-1 rounded-md px-2 py-1 font-medium text-gray-600 text-xs hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-accent-light focus-visible:outline-offset-2 dark:text-gray-300 dark:focus-visible:outline-accent-dark dark:hover:bg-gray-800 dark:hover:text-gray-100"
        >
          <XMarkIcon aria-hidden="true" className="size-4" />
          <FormattedMessage id="general.close" defaultMessage="Close" />
        </button>
      </div>

      <section className="border-gray-200 border-t pt-3 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="font-medium text-gray-700 dark:text-gray-200">
            <FormattedMessage
              id="component.impact_timeline"
              defaultMessage="Impact timeline"
            />
          </span>
          <span className="text-gray-500 text-xs dark:text-gray-400">
            <FormattedMessage
              id="component.impact_durations_may_overlap"
              defaultMessage="Durations may overlap"
            />
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-y-3">
          {orderedIssueTypeBreakdowns.map(([issueType, entry]) => (
            <TimelineLane
              key={issueType}
              type={`ongoing_${issueType}` as LineSummaryStatus}
              label={intl.formatMessage(
                issueType === 'disruption'
                  ? {
                      id: 'general.disruption',
                      defaultMessage: 'Disruption',
                    }
                  : issueType === 'maintenance'
                    ? {
                        id: 'general.maintenance',
                        defaultMessage: 'Maintenance',
                      }
                    : {
                        id: 'general.infrastructure',
                        defaultMessage: 'Infrastructure',
                      },
              )}
              duration={Duration.fromObject({
                seconds: entry.totalDurationSeconds,
              })}
              intervals={entry.intervals.map((interval) => ({
                start: DateTime.fromISO(interval.startAt),
                end: DateTime.fromISO(interval.endAt),
              }))}
              timelineStart={timelineStart}
              timelineEnd={timelineEnd}
            />
          ))}

          {notInServiceDuration.as('seconds') > 0 && (
            <TimelineLane
              type="closed_for_day"
              label={intl.formatMessage({
                id: 'status.service_ended',
                defaultMessage: 'Off Hours',
              })}
              duration={notInServiceDuration}
              intervals={offHoursIntervals}
              timelineStart={timelineStart}
              timelineEnd={timelineEnd}
            />
          )}

          {!hasIssueBreakdowns && notInServiceDuration.as('seconds') === 0 && (
            <p className="text-gray-600 italic dark:text-gray-300">
              <FormattedMessage
                id="general.no_downtime_on_this_day"
                defaultMessage="No downtime recorded on this day."
              />
            </p>
          )}
        </div>

        <div className="mt-1.5 hidden grid-cols-5 pl-[calc(13rem+1rem)] text-gray-500 text-xs tabular-nums sm:grid dark:text-gray-400">
          {axisTimes.map((axisTime, index) => (
            <span
              key={axisTime.toMillis()}
              className={classNames({
                'text-center': index > 0 && index < axisTimes.length - 1,
                'text-right': index === axisTimes.length - 1,
              })}
            >
              <FormattedTime
                value={axisTime.toJSDate()}
                hour="numeric"
                minute={axisTime.minute === 0 ? undefined : '2-digit'}
                timeZone={SINGAPORE_TIME_ZONE}
              />
            </span>
          ))}
        </div>
      </section>

      {hasIssueBreakdowns && (
        <section className="mt-3 border-gray-200 border-t pt-3 dark:border-gray-700">
          <span className="font-medium text-gray-500 text-xs uppercase tracking-wide dark:text-gray-400">
            <FormattedMessage id="general.related" defaultMessage="Related" />
          </span>
          <div className="mt-1 flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
            {orderedIssueTypeBreakdowns.map(([issueType, entry]) => (
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
                      className="flex items-center gap-x-2 py-2 text-gray-700 transition-colors hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent-light dark:text-gray-200 dark:focus:ring-accent-dark dark:hover:text-gray-100"
                    >
                      <span
                        className={classNames(
                          'size-2.5 shrink-0 rounded-full',
                          {
                            'bg-disruption-light dark:bg-disruption-dark':
                              issueType === 'disruption',
                            'bg-maintenance-light dark:bg-maintenance-dark':
                              issueType === 'maintenance',
                            'bg-infra-light dark:bg-infra-dark':
                              issueType === 'infra',
                          },
                        )}
                      />
                      <span className="leading-tight">
                        {getLocalizedTranslation(issueRef.title, intl.locale)}
                      </span>
                    </Link>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
