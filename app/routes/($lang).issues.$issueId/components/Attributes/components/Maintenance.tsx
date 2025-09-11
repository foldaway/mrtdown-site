import { DateTime } from 'luxon';
import { Dialog } from 'radix-ui';
import { useMemo } from 'react';
import { FormattedDateTimeRange, FormattedMessage } from 'react-intl';
import type { Issue } from '~/client';
import { IssueStatusBadge } from '~/components/IssueStatusBadge';

interface Props {
  issue: Issue;
}

export const Maintenance: React.FC<Props> = (props) => {
  const { issue } = props;
  const { intervals } = issue;

  const { endedIntervalCount, ongoingIntervalCount, futureIntervalCount } =
    useMemo(() => {
      let _endedIntervalCount = 0;
      let _ongoingIntervalCount = 0;
      let _futureIntervalCount = 0;

      for (const interval of intervals) {
        switch (interval.status) {
          case 'ongoing': {
            _ongoingIntervalCount++;
            break;
          }
          case 'future': {
            _futureIntervalCount++;
            break;
          }
          case 'ended': {
            _endedIntervalCount++;
            break;
          }
        }
      }
      return {
        endedIntervalCount: _endedIntervalCount,
        futureIntervalCount: _futureIntervalCount,
        ongoingIntervalCount: _ongoingIntervalCount,
      };
    }, [intervals]);

  const nextInterval = useMemo(() => {
    return (
      intervals.find((i) => i.status === 'future' || i.status === 'ongoing') ||
      null
    );
  }, [intervals]);

  return (
    <>
      <div>
        <dt className="text-gray-500 text-xs uppercase dark:text-gray-400">
          <FormattedMessage
            id="general.maintenance_period"
            defaultMessage="Maintenance Period"
          />
        </dt>
        <dd className="font-medium text-base text-gray-800 dark:text-gray-200">
          <FormattedDateTimeRange
            from={DateTime.fromISO(intervals[0].startAt).toMillis()}
            to={DateTime.fromISO(
              intervals[intervals.length - 1].startAt,
            ).toMillis()}
            dateStyle="medium"
          />
        </dd>
      </div>

      <div>
        <dt className="text-gray-500 text-xs uppercase dark:text-gray-400">
          <FormattedMessage
            id="general.next_maintenance"
            defaultMessage="Next Maintenance"
          />
        </dt>
        <dd className="font-medium text-base text-gray-800 dark:text-gray-200">
          {nextInterval != null ? (
            nextInterval.endAt != null ? (
              <FormattedDateTimeRange
                timeStyle="short"
                dateStyle="medium"
                from={DateTime.fromISO(nextInterval.startAt).toMillis()}
                to={DateTime.fromISO(nextInterval.endAt).toMillis()}
              />
            ) : (
              <FormattedMessage
                id="general.ongoing_timestamp"
                defaultMessage="{start, date, medium} {start, time, short} to present"
                values={{
                  start: nextInterval.startAt,
                }}
              />
            )
          ) : (
            <FormattedMessage
              id="general.no_upcoming_maintenance"
              defaultMessage="No upcoming maintenance"
            />
          )}
        </dd>
      </div>

      <div>
        <dt className="text-gray-500 text-xs uppercase dark:text-gray-400">
          <FormattedMessage id="general.sessions" defaultMessage="Sessions" />
        </dt>
        <dd className="font-medium text-base text-gray-800 dark:text-gray-200">
          <FormattedMessage
            id="general.maintenance_sessions_summary"
            defaultMessage="{endedIntervalCount} ended, {ongoingIntervalCount} ongoing, {futureIntervalCount} remaining"
            values={{
              endedIntervalCount: endedIntervalCount,
              ongoingIntervalCount: ongoingIntervalCount,
              futureIntervalCount: futureIntervalCount,
            }}
          />

          <Dialog.Root>
            <Dialog.Trigger className="block text-blue-600 text-sm underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200">
              <FormattedMessage
                id="general.view_details"
                defaultMessage="View Details"
              />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in" />
              <Dialog.Content className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed top-[50%] left-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-xl duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in sm:rounded-lg dark:border-gray-700 dark:bg-gray-800">
                <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                  <Dialog.Title className="font-semibold text-gray-900 text-lg leading-none tracking-tight dark:text-gray-100">
                    <FormattedMessage
                      id="general.maintenance_sessions_details"
                      defaultMessage="Maintenance Sessions Details"
                    />
                  </Dialog.Title>
                </div>
                <div className="max-h-[60vh] space-y-3.5 overflow-y-auto pr-2">
                  {intervals.map((interval, index) => (
                    <div
                      key={`${interval.startAt}-${interval.endAt}`}
                      className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-900/50"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            <FormattedMessage
                              id="general.session_number"
                              defaultMessage="Session {number}"
                              values={{ number: index + 1 }}
                            />
                          </h4>
                          {index === intervals.length - 1 && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 text-xs dark:bg-amber-900/30 dark:text-amber-300">
                              <FormattedMessage
                                id="general.last"
                                defaultMessage="Last"
                              />
                            </span>
                          )}
                        </div>
                        <IssueStatusBadge interval={interval} issue={issue} />
                      </div>
                      <p className="text-gray-600 text-sm dark:text-gray-400">
                        {interval.endAt != null ? (
                          <FormattedDateTimeRange
                            timeStyle="short"
                            dateStyle="medium"
                            from={DateTime.fromISO(interval.startAt).toMillis()}
                            to={DateTime.fromISO(interval.endAt).toMillis()}
                          />
                        ) : (
                          <FormattedMessage
                            id="general.ongoing_timestamp"
                            defaultMessage="{start, date, medium} {start, time, short} to present"
                            values={{
                              start: interval.startAt,
                            }}
                          />
                        )}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
                  <Dialog.Close className="inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-4 py-2 font-medium text-sm text-white ring-offset-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:bg-blue-500 dark:ring-offset-gray-950 dark:focus-visible:ring-blue-300 dark:hover:bg-blue-600">
                    <FormattedMessage
                      id="general.close"
                      defaultMessage="Close"
                    />
                  </Dialog.Close>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </dd>
      </div>
    </>
  );
};
