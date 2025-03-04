import * as Popover from '@radix-ui/react-popover';
import type { DateSummary } from '../../../types';
import { DateTime, Duration } from 'luxon';
import { useMemo, useState } from 'react';
import { computeStatus } from '../helpers/computeStatus';
import { Link } from 'react-router';
import classNames from 'classnames';
import { useDebounce } from 'use-debounce';

interface Props {
  dateTime: DateTime;
  dateOverview: DateSummary;
  isBeforeComponentStartDate: boolean;
}

export const DateCard: React.FC<Props> = (props) => {
  const { dateTime, dateOverview, isBeforeComponentStartDate } = props;
  const { issues, issueTypesDurationMs } = dateOverview;

  const [isOpen, setIsOpen] = useState(false);
  const [isOpenDebounced] = useDebounce(isOpen, 100);

  const dateHumanFormat = useMemo(() => {
    return dateTime.toLocaleString(DateTime.DATE_FULL);
  }, [dateTime]);

  const status = useMemo(() => {
    return computeStatus(issueTypesDurationMs);
  }, [issueTypesDurationMs]);

  if (isBeforeComponentStartDate) {
    return (
      <div className="h-5 w-1.5 shrink-0 rounded-xs bg-gray-400 dark:bg-gray-600" />
    );
  }

  return (
    <Popover.Root open={isOpenDebounced} onOpenChange={setIsOpen}>
      <Popover.Trigger
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        <div
          className={classNames(
            'h-5 w-1.5 rounded-xs transition-transform hover:scale-150',
            {
              'bg-disruption-major-light dark:bg-disruption-major-dark':
                status === 'disruption',
              'bg-maintenance-light dark:bg-maintenance-dark':
                status === 'maintenance',
              'bg-infra-light dark:bg-infra-dark': status === 'infra',
              'bg-operational-light dark:bg-operational-dark': status == null,
            },
          )}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="flex w-64 flex-col rounded border border-gray-300 bg-gray-100 px-4 py-2 dark:border-gray-600 dark:bg-gray-700"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          <span className="font-bold text-gray-600 text-sm dark:text-gray-300">
            {dateHumanFormat}
          </span>

          {status == null && (
            <span className="text-gray-500 text-sm dark:text-gray-400">
              No downtime recorded on this day.
            </span>
          )}
          {Object.entries(issueTypesDurationMs).map(
            ([issueType, durationMs]) => (
              <div key={issueType} className="flex items-center">
                <div
                  className={classNames(
                    'me-1 size-3 rounded-full hover:opacity-55',
                    {
                      'bg-disruption-major-light dark:bg-disruption-major-dark':
                        status === 'disruption',
                      'bg-maintenance-light dark:bg-maintenance-dark':
                        status === 'maintenance',
                      'bg-infra-light dark:bg-infra-dark': status === 'infra',
                      'bg-operational-light dark:bg-operational-dark':
                        status == null,
                    },
                  )}
                />
                <span className="text-gray-400 text-sm capitalize">
                  {issueType}
                </span>
                <span className="ms-auto text-gray-400 text-sm">
                  {Duration.fromObject({ milliseconds: durationMs })
                    .rescale()
                    .set({ seconds: 0 })
                    .rescale()
                    .toHuman({ unitDisplay: 'narrow' })}
                </span>
              </div>
            ),
          )}
          {issues.length > 0 && (
            <span className="mt-4 mb-1 text-gray-400 text-xs uppercase dark:text-gray-400">
              Related
            </span>
          )}
          {issues.map((issueRef) => (
            <Link
              key={issueRef.id}
              to={`/issues/${issueRef.id}`}
              className="text-gray-600 text-sm hover:underline dark:text-gray-300"
            >
              {issueRef.title}
            </Link>
          ))}
          <Popover.Arrow className="fill-gray-300 dark:fill-gray-600" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
