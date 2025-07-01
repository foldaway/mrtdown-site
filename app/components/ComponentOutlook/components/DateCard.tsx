import * as Popover from '@radix-ui/react-popover';
import classNames from 'classnames';
import { type DateTime, Duration, Interval } from 'luxon';
import { useMemo, useState } from 'react';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router';
import { useDebounce } from 'use-debounce';
import { FormattedDuration } from '~/components/FormattedDuration';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { useHydrated } from '../../../hooks/useHydrated';
import type { DateSummary, Issue } from '../../../types';
import { computeStatus } from '../helpers/computeStatus';

interface Props {
  dateTime: DateTime;
  dateOverview: DateSummary;
}

export const DateCard: React.FC<Props> = (props) => {
  const { dateTime, dateOverview } = props;
  const { issues, issueTypesDurationMs } = dateOverview;

  const [isOpen, setIsOpen] = useState(false);
  const [isOpenDebounced] = useDebounce(isOpen, 100);

  const isHydrated = useHydrated();
  const intl = useIntl();

  const status = useMemo(
    () => computeStatus(issueTypesDurationMs),
    [issueTypesDurationMs],
  );

  const percentages = useMemo(() => {
    const serviceHours = Interval.fromDateTimes(
      dateTime.startOf('day').set({ hour: 5, minute: 30 }),
      dateTime.startOf('day').plus({ days: 1 }),
    );

    return Object.fromEntries(
      Object.entries(issueTypesDurationMs).map(([issueType, durationMs]) => {
        return [
          issueType,
          (durationMs / serviceHours.toDuration().toMillis()) * 100,
        ];
      }),
    );
  }, [issueTypesDurationMs, dateTime]);

  return (
    <Popover.Root open={isOpenDebounced} onOpenChange={setIsOpen}>
      <Popover.Trigger
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="outline-none"
      >
        <div className="flex h-7 w-1.5 flex-col-reverse overflow-hidden rounded-xs bg-operational-light transition-transform hover:scale-150 dark:bg-operational-dark">
          {Object.entries(percentages).map(
            ([issueType, percentage]) =>
              percentage > 0 && (
                <div
                  key={issueType}
                  className={classNames('flex w-1.5 bg-blue-400', {
                    'bg-disruption-light dark:bg-disruption-dark':
                      issueType === 'disruption',
                    'bg-maintenance-light dark:bg-maintenance-dark':
                      issueType === 'maintenance',
                    'bg-infra-light dark:bg-infra-dark': status === 'infra',
                  })}
                  style={{
                    flexBasis: `${Math.max(25, percentage).toFixed(1)}%`,
                  }}
                />
              ),
          )}
        </div>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="flex w-64 flex-col rounded border border-gray-300 bg-gray-100 px-4 py-2 outline-none dark:border-gray-600 dark:bg-gray-700"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <span className="font-bold text-gray-600 text-sm dark:text-gray-300">
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

          {status == null && (
            <span className="text-gray-500 text-sm dark:text-gray-400">
              <FormattedMessage
                id="general.no_downtime_on_this_day"
                defaultMessage="No downtime recorded on this day."
              />
            </span>
          )}
          {Object.entries(issueTypesDurationMs)
            .filter(([, durationMs]) => durationMs > 0)
            .map(([key, durationMs]) => {
              const issueType = key as Issue['type'];
              return (
                <div key={issueType} className="flex items-center">
                  <div
                    className={classNames(
                      'me-1 size-3 rounded-full hover:opacity-55',
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
                  <span className="text-gray-400 text-sm capitalize">
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
                  <span className="ms-auto text-gray-400 text-sm">
                    {isHydrated ? (
                      <FormattedDuration
                        duration={Duration.fromObject({
                          milliseconds: durationMs,
                        })
                          .rescale()
                          .set({ seconds: 0 })
                          .rescale()}
                      />
                    ) : (
                      Duration.fromObject({
                        milliseconds: durationMs,
                      }).toISO()
                    )}
                  </span>
                </div>
              );
            })}
          {issues.length > 0 && (
            <span className="mt-4 mb-1 text-gray-400 text-xs uppercase dark:text-gray-400">
              <FormattedMessage id="general.related" defaultMessage="Related" />
            </span>
          )}
          {issues.map((issueRef) => (
            <Link
              key={issueRef.id}
              to={buildLocaleAwareLink(`/issues/${issueRef.id}`, intl.locale)}
              className="text-gray-600 text-sm hover:underline dark:text-gray-300"
            >
              {issueRef.title_translations[intl.locale] ?? issueRef.title}
            </Link>
          ))}
          <Popover.Arrow className="fill-gray-300 dark:fill-gray-600" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
