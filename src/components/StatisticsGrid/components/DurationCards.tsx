import { Duration } from 'luxon';
import type React from 'react';
import { useMemo } from 'react';
import type { Statistics } from '../../../types';

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
    });
  }, [statistics]);

  const durationTotal = useMemo(() => {
    return Duration.fromObject({
      days: statistics.issuesDisruptionDurationTotalDays,
    });
  }, [statistics]);

  return (
    <>
      <div className="flex flex-col rounded-lg border border-gray-300 p-6 shadow-lg dark:border-gray-700">
        <span className="text-base">Disruption time (average)</span>
        <span className="mt-2.5 font-bold text-4xl">
          {durationAvg
            .shiftTo('days')
            .rescale()
            .set({ seconds: 0, milliseconds: 0 })
            .rescale()
            .toHuman({ unitDisplay: 'short' })}
        </span>
        <span className="text-gray-400 text-sm dark:text-gray-500">
          over {statistics.issuesDisruptionHistoricalCount} issues
        </span>
      </div>
      <div className="flex flex-col rounded-lg border border-gray-300 p-6 shadow-lg dark:border-gray-700">
        <span className="text-base">Disruption time (total)</span>
        <span className="mt-2.5 font-bold text-4xl">
          {durationTotal
            .shiftTo('days')
            .rescale()
            .set({ seconds: 0, milliseconds: 0 })
            .rescale()
            .toHuman({ unitDisplay: 'short' })}
        </span>
        <span className="text-gray-400 text-sm dark:text-gray-500">
          over {statistics.issuesDisruptionHistoricalCount} issues
        </span>
      </div>
    </>
  );
};
