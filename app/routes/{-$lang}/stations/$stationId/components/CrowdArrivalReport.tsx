import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  type ArrivalBranchScope,
  CROWD_ARRIVAL_COOLDOWN_SECONDS,
  type CrowdArrivalSubmission,
  type RecentCrowdArrival as RecentReport,
} from '~/util/crowdArrivalReportContract';

const SUBMISSION_TIMEOUT_MS = 10_000;

type RecentCrowdArrivalProps = { report: RecentReport };

export function RecentCrowdArrival({ report }: RecentCrowdArrivalProps) {
  const intl = useIntl();
  return (
    <p className="mt-2 rounded-md bg-gray-50 px-2.5 py-1.5 text-gray-700 text-xs dark:bg-gray-900/40 dark:text-gray-200">
      <FormattedMessage
        id="station.arrival_report.recent"
        defaultMessage="Rider-reported arrival: <clock>{time}</clock>"
        values={{
          time: intl.formatTime(report.expectedAt, {
            timeZone: 'Asia/Singapore',
          }),
          clock: (time) => (
            <time
              className="font-semibold tabular-nums"
              dateTime={report.expectedAt}
            >
              {time}
            </time>
          ),
        }}
      />
    </p>
  );
}

type CrowdArrivalReportProps = {
  scope: ArrivalBranchScope;
  onSubmitted: () => Promise<void>;
};

export function CrowdArrivalReport({
  scope,
  onSubmitted,
}: CrowdArrivalReportProps) {
  const [status, setStatus] = useState<
    'idle' | 'sending' | 'sent' | 'error' | 'rate-limited'
  >('idle');
  const coolingDown = status === 'sent' || status === 'rate-limited';

  useEffect(() => {
    if (!coolingDown) return;
    const timeout = window.setTimeout(
      () => setStatus('idle'),
      CROWD_ARRIVAL_COOLDOWN_SECONDS * 1000,
    );
    return () => window.clearTimeout(timeout);
  }, [coolingDown]);

  async function submit(
    minutesToArrival: CrowdArrivalSubmission['minutesToArrival'],
  ) {
    setStatus('sending');
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      SUBMISSION_TIMEOUT_MS,
    );
    try {
      const response = await fetch('/api/arrival-reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...scope, minutesToArrival }),
        signal: controller.signal,
      });
      if (!response.ok) {
        setStatus(response.status === 429 ? 'rate-limited' : 'error');
        return;
      }
    } catch {
      setStatus('error');
      return;
    } finally {
      window.clearTimeout(timeout);
    }
    setStatus('sent');
    await onSubmitted();
  }

  return (
    <details className="mt-1 text-xs">
      <summary className="w-fit cursor-pointer rounded py-1 text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300">
        <FormattedMessage
          id="station.arrival_report.summary"
          defaultMessage="Report an arrival"
        />
      </summary>
      <div className="mt-1 rounded-lg bg-blue-50 px-3 py-2 text-gray-700 dark:bg-blue-950/30 dark:text-gray-200">
        {status !== 'sent' && (
          <>
            <p>
              <FormattedMessage
                id="station.arrival_report.explainer"
                defaultMessage="At this station? Share the arrival time shown on the station display for this service."
              />
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[0, 1, 3, 5].map((minutes) => (
                <button
                  className="min-h-8 rounded-md border border-blue-300 bg-white px-2 py-1 font-medium text-blue-800 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-blue-700 dark:bg-gray-900 dark:text-blue-200 dark:hover:bg-blue-900"
                  disabled={status === 'sending' || coolingDown}
                  key={minutes}
                  onClick={() => void submit(minutes)}
                  type="button"
                >
                  {minutes === 0 ? (
                    <FormattedMessage
                      id="station.arrival_report.arriving_now"
                      defaultMessage="Arriving now"
                    />
                  ) : (
                    <FormattedMessage
                      id="station.arrival_report.minutes"
                      defaultMessage="{minutes} min away"
                      values={{ minutes }}
                    />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
        <div aria-live="polite">
          {status === 'sending' && (
            <FormattedMessage
              id="report.submitting"
              defaultMessage="Submitting"
            />
          )}
          {status === 'sent' && (
            <FormattedMessage
              id="station.arrival_report.thanks"
              defaultMessage="Thanks. Your arrival report was shared."
            />
          )}
          {status === 'error' && (
            <p className="mt-2 text-red-700 dark:text-red-300">
              <FormattedMessage
                id="station.arrival_report.error"
                defaultMessage="Couldn’t send your report. Please try again."
              />
            </p>
          )}
          {status === 'rate-limited' && (
            <p className="mt-2 text-red-700 dark:text-red-300">
              <FormattedMessage
                id="station.arrival_report.rate_limited"
                defaultMessage="Please wait before reporting another arrival."
              />
            </p>
          )}
        </div>
      </div>
    </details>
  );
}
