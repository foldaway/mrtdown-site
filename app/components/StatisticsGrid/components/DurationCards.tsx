import { Duration } from 'luxon';
import type React from 'react';
import { useMemo } from 'react';
import type { Statistics } from '../../../types';
import { useHydrated } from '../../../hooks/useHydrated';
import { FormattedMessage } from 'react-intl';
import { FormattedDuration } from '~/components/FormattedDuration';

interface Props {
  statistics: Statistics;
}

export const DurationCards: React.FC<Props> = (props) => {
  const { statistics } = props;

  const durationAvg = useMemo(() => {
    return Duration.fromObject({
      days:
        statistics.issuesDisruptionDurationTotalDays /
        statistics.issuesDisruptionHistoricalCount,
    }).rescale();
  }, [statistics]);

  const durationTotal = useMemo(() => {
    return Duration.fromObject({
      days: statistics.issuesDisruptionDurationTotalDays,
    }).rescale();
  }, [statistics]);

  const isHydrated = useHydrated();

  return (
    <>
      <div className="flex flex-col rounded-lg border border-gray-300 p-6 shadow-lg dark:border-gray-700">
        <span className="text-base">
          <FormattedMessage
            id="general.disruption_time_average"
            defaultMessage="Disruption time (average)"
          />
        </span>
        <span className="mt-2.5 font-bold text-4xl">
          {isHydrated ? (
            <FormattedDuration
              duration={durationAvg
                .set({ seconds: 0, milliseconds: 0 })
                .rescale()}
            />
          ) : (
            durationAvg.toISO()
          )}
        </span>
        <span className="text-gray-400 text-sm dark:text-gray-500">
          <FormattedMessage
            id="general.across_hours_within_service_hours"
            defaultMessage="across {count} issues, within service hours"
            values={{
              count: statistics.issuesDisruptionHistoricalCount,
            }}
          />
        </span>
      </div>
      <div className="flex flex-col rounded-lg border border-gray-300 p-6 shadow-lg dark:border-gray-700">
        <span className="text-base">
          <FormattedMessage
            id="general.disruption_time_total"
            defaultMessage="Disruption time (total)"
          />
        </span>
        <span className="mt-2.5 font-bold text-4xl">
          {isHydrated ? (
            <FormattedDuration
              duration={durationTotal
                .set({ seconds: 0, milliseconds: 0 })
                .rescale()}
            />
          ) : (
            durationTotal.toISO()
          )}
        </span>
        <span className="text-gray-400 text-sm dark:text-gray-500">
          <FormattedMessage
            id="general.across_hours_within_service_hours"
            defaultMessage="across {count} issues, within service hours"
            values={{
              count: statistics.issuesDisruptionHistoricalCount,
            }}
          />
        </span>
      </div>
    </>
  );
};
