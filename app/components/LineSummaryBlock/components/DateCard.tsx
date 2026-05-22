import { CalendarDaysIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { type DateTime, Duration } from 'luxon';
import { Fragment, useMemo } from 'react';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';
import type {
  Issue,
  Line,
  LineSummaryDateRecord,
  LineSummaryStatus,
} from '~/types';
import { FormattedDuration } from '~/components/FormattedDuration';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
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
  isActive: boolean;
  onToggle: () => void;
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

  return { operatingHours, notInServiceDuration, segments };
}

export const DateCard: React.FC<Props> = (props) => {
  const { line, dateTime, data } = props;
  const { segments } = useDateBreakdown(line, dateTime, data);

  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-label={dateTime.toISODate() ?? undefined}
      aria-expanded={props.isActive}
      className={classNames(
        'group cursor-pointer rounded-sm transition-all duration-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-1 dark:focus:ring-accent-dark dark:hover:bg-gray-800',
        {
          'bg-gray-100 ring-2 ring-accent-light ring-offset-1 dark:bg-gray-800 dark:ring-accent-dark':
            props.isActive,
        },
      )}
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

export const DateCardDetails: React.FC<Omit<Props, 'isActive' | 'onToggle'>> = (
  props,
) => {
  const { line, dateTime, data, issues } = props;
  const { breakdownByIssueTypes, dayType } = data;

  const isHydrated = useHydrated();
  const intl = useIntl();
  const { operatingHours, notInServiceDuration } = useDateBreakdown(
    line,
    dateTime,
    data,
  );

  return (
    <div className="flex flex-col text-sm">
      <div className="flex items-start gap-x-3 pb-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <CalendarDaysIcon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 leading-tight dark:text-gray-100">
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
          </p>
          <p className="mt-1 text-gray-500 text-xs dark:text-gray-400">
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
          </p>
        </div>
      </div>

      <div className="border-gray-200 border-t py-3 dark:border-gray-700">
        <div className="grid grid-cols-[auto_1fr] gap-x-3">
          <ClockIcon className="mt-0.5 size-4 text-gray-500 dark:text-gray-400" />
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="font-medium text-gray-700 dark:text-gray-200">
              <FormattedMessage
                id="component.service_hours"
                defaultMessage="Service hours"
              />
            </span>
            <span className="text-gray-600 dark:text-gray-300">
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
        </div>
      </div>

      <div className="border-gray-200 border-t py-3 dark:border-gray-700">
        <span className="font-medium text-gray-500 text-xs uppercase tracking-wide dark:text-gray-400">
          <FormattedMessage id="general.impact" defaultMessage="Impact" />
        </span>
        <div className="mt-2 flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
          {notInServiceDuration.as('seconds') > 0 && (
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 py-2">
              <div className="size-2.5 rounded-full bg-gray-400 dark:bg-gray-600" />
              <span className="font-medium text-gray-700 capitalize dark:text-gray-200">
                <FormattedMessage
                  id="status.service_ended"
                  defaultMessage="Service Ended"
                />
              </span>
              <span className="text-gray-600 dark:text-gray-300">
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
              <div
                key={issueType}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 py-2"
              >
                <div
                  className={classNames('size-2.5 rounded-full', {
                    'bg-disruption-light dark:bg-disruption-dark':
                      issueType === 'disruption',
                    'bg-maintenance-light dark:bg-maintenance-dark':
                      issueType === 'maintenance',
                    'bg-infra-light dark:bg-infra-dark': issueType === 'infra',
                  })}
                />
                <span className="font-medium text-gray-700 capitalize dark:text-gray-200">
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
                <span className="text-gray-600 dark:text-gray-300">
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
        </div>
      </div>

      <div className="border-gray-200 border-t pt-3 dark:border-gray-700">
        <span className="font-medium text-gray-500 text-xs uppercase tracking-wide dark:text-gray-400">
          <FormattedMessage id="general.related" defaultMessage="Related" />
        </span>
        {Object.keys(breakdownByIssueTypes).length === 0 && (
          <p className="mt-1 text-gray-600 italic dark:text-gray-300">
            <FormattedMessage
              id="general.no_downtime_on_this_day"
              defaultMessage="No downtime recorded on this day."
            />
          </p>
        )}
        <div className="mt-2 flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
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
                    className="flex items-center gap-x-2 py-2 text-gray-700 transition-colors hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent-light dark:text-gray-200 dark:focus:ring-accent-dark dark:hover:text-gray-100"
                  >
                    <div
                      className={classNames('size-2.5 shrink-0 rounded-full', {
                        'bg-disruption-light dark:bg-disruption-dark':
                          issueType === 'disruption',
                        'bg-maintenance-light dark:bg-maintenance-dark':
                          issueType === 'maintenance',
                        'bg-infra-light dark:bg-infra-dark':
                          issueType === 'infra',
                      })}
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
      </div>
    </div>
  );
};
