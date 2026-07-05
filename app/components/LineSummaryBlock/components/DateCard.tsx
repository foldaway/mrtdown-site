import { CalendarDaysIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { type DateTime, Duration } from 'luxon';
import { Fragment, useMemo } from 'react';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';
import { FormattedDuration } from '~/components/FormattedDuration';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type {
  Issue,
  Line,
  LineSummaryDateRecord,
  LineSummaryStatus,
} from '~/types';
import { useHydrated } from '../../../hooks/useHydrated';
import { DAY_TYPE_MESSAGE_DESCRIPTORS } from '../constants';
import { getOrderedIssueTypeBreakdowns } from '../helpers/orderIssueTypeBreakdowns';
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
  onActivate: () => void;
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

export const DateCardDetails: React.FC<
  Omit<Props, 'isActive' | 'onActivate'>
> = (props) => {
  const { line, dateTime, data, issues } = props;
  const { breakdownByIssueTypes, dayType } = data;

  const isHydrated = useHydrated();
  const intl = useIntl();
  const orderedIssueTypeBreakdowns = getOrderedIssueTypeBreakdowns(
    breakdownByIssueTypes,
  );
  const { operatingHours, notInServiceDuration } = useDateBreakdown(
    line,
    dateTime,
    data,
  );

  return (
    <div className="flex flex-col text-sm">
      <div className="grid gap-3 pb-3 sm:grid-cols-[minmax(0,_1.35fr)_minmax(0,_1fr)]">
        <div className="flex items-start gap-x-3">
          <CalendarDaysIcon className="mt-0.5 size-5 shrink-0 text-gray-500 dark:text-gray-400" />
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

        <div className="grid grid-cols-[auto_1fr] gap-x-3 sm:border-gray-200 sm:border-l sm:pl-4 dark:sm:border-gray-700">
          <ClockIcon className="mt-0.5 size-5 text-gray-500 dark:text-gray-400" />
          <div className="min-w-0">
            <span className="font-medium text-gray-500 text-xs uppercase dark:text-gray-400">
              <FormattedMessage
                id="component.service_hours"
                defaultMessage="Service hours"
              />
            </span>
            <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100">
              <FormattedMessage
                id="component.service_hours_description"
                defaultMessage="{start, time, short} to {end, time, short}"
                values={{
                  start: operatingHours.start.toMillis(),
                  end: operatingHours.end.toMillis(),
                }}
              />
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-gray-200 border-t pt-3 lg:grid-cols-[minmax(0,_1fr)_minmax(16rem,_0.55fr)] dark:border-gray-700">
        <section>
          <span className="font-medium text-gray-500 text-xs uppercase tracking-wide dark:text-gray-400">
            <FormattedMessage id="general.impact" defaultMessage="Impact" />
          </span>
          <div className="mt-2 flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
            {notInServiceDuration.as('seconds') === 0 &&
              Object.keys(breakdownByIssueTypes).length === 0 && (
                <p className="py-2 text-gray-600 italic dark:text-gray-300">
                  <FormattedMessage
                    id="general.no_downtime_on_this_day"
                    defaultMessage="No downtime recorded on this day."
                  />
                </p>
              )}
            {notInServiceDuration.as('seconds') > 0 && (
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 py-2">
                <div className="size-2.5 rounded-full bg-gray-400 dark:bg-gray-600" />
                <span className="font-medium text-gray-700 capitalize dark:text-gray-200">
                  <FormattedMessage
                    id="status.service_ended"
                    defaultMessage="Off Hours"
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

            {orderedIssueTypeBreakdowns.map(([issueType, entry]) => {
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
                      'bg-infra-light dark:bg-infra-dark':
                        issueType === 'infra',
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
        </section>

        <section className="border-gray-200 border-t pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4 dark:border-gray-700">
          <span className="font-medium text-gray-500 text-xs uppercase tracking-wide dark:text-gray-400">
            <FormattedMessage id="general.related" defaultMessage="Related" />
          </span>
          {Object.keys(breakdownByIssueTypes).length === 0 && (
            <p className="mt-2 text-gray-600 italic dark:text-gray-300">
              <FormattedMessage
                id="general.no_related_issues"
                defaultMessage="No related issues."
              />
            </p>
          )}
          <div className="mt-2 flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
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
                      <div
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
      </div>
    </div>
  );
};
