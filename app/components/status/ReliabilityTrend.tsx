import { ArrowTrendingUpIcon } from '@heroicons/react/24/solid';
import { DateTime, Duration } from 'luxon';
import type React from 'react';
import { useMemo } from 'react';
import { FormattedMessage, FormattedNumber } from 'react-intl';
import type { DateSummary } from '~/types';

interface Props {
  dates: Record<string, DateSummary>;
}

export const ReliabilityTrend: React.FC<Props> = (props) => {
  const { dates } = props;

  const now = useMemo(() => DateTime.now(), []);

  const { uptimePrevPeriod, uptimeCurrentPeriod } = useMemo(() => {
    // Account for service hours, 5:30 AM - 12 midnight
    const periodServiceHours = Duration.fromObject({
      hours: 18.5 * 30,
    }).rescale();

    let durationPrevPeriod = Duration.fromObject({ milliseconds: 0 });
    let durationCurrentPeriod = Duration.fromObject({ milliseconds: 0 });

    for (let i = -60; i <= 0; i++) {
      const dateTime = now.minus({ days: -i });
      const dateOverview = dates[dateTime.toISODate()] ?? {
        issueTypesDurationMs: 0,
        issueTypesIntervalsNoOverlapMs: {},
        issues: [],
        componentIdsIssueTypesDurationMs: {},
        componentIdsIssueTypesIntervalsNoOverlapMs: {},
      };

      for (const durationMs of Object.values(
        dateOverview.issueTypesDurationMs,
      )) {
        if (i < -30) {
          durationPrevPeriod = durationPrevPeriod.plus({
            milliseconds: durationMs,
          });
        } else {
          durationCurrentPeriod = durationCurrentPeriod.plus({
            milliseconds: durationMs,
          });
        }
      }
    }

    const _uptimePrevPeriod =
      1 - durationPrevPeriod.toMillis() / periodServiceHours.toMillis();
    const _uptimeCurrentPeriod =
      1 - durationCurrentPeriod.toMillis() / periodServiceHours.toMillis();

    return {
      uptimePrevPeriod: _uptimePrevPeriod,
      uptimeCurrentPeriod: _uptimeCurrentPeriod,
    };
  }, [dates, now]);

  const changeSummary = useMemo(() => {
    if (uptimePrevPeriod === uptimeCurrentPeriod) {
      return 'unchanged';
    }

    if (uptimePrevPeriod < uptimeCurrentPeriod) {
      return 'positive';
    }

    return 'negative';
  }, [uptimePrevPeriod, uptimeCurrentPeriod]);

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-gray-300 bg-white py-2 dark:border-gray-700 dark:bg-gray-800">
      <ArrowTrendingUpIcon className="size-10" />

      <span className="font-bold text-gray-700 text-xl dark:text-gray-100">
        <FormattedMessage
          id="general.component_status.reliability_trend"
          defaultMessage="Reliability Trend"
        />
      </span>

      <span className="text-gray-500 text-sm dark:text-gray-400">
        <FormattedMessage
          id="general.component_status.reliability_trend_summary"
          defaultMessage="{changeSummary, select, positive {Improving} negative {Declined} other {Unchanged}} over last 30 days"
          values={{
            changeSummary,
          }}
        />
      </span>

      <span className="mt-1 rounded-lg bg-gray-200 px-2 py-0.5 text-xs dark:bg-gray-700">
        <FormattedMessage
          id="general.component_status.reliability_trend_uptime_change"
          defaultMessage="{percentChange, number, ::sign-always percent .##} vs previous 30 days"
          values={{
            percentChange: uptimeCurrentPeriod - uptimePrevPeriod,
          }}
        />
      </span>
    </div>
  );
};
