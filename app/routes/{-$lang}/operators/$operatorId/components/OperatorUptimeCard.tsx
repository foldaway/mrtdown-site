import { FormattedMessage, FormattedNumber } from 'react-intl';

interface Props {
  aggregateUptimeRatio: number | null;
  dateCount: number;
}

export const OperatorUptimeCard: React.FC<Props> = (props) => {
  const { aggregateUptimeRatio, dateCount } = props;
  const uptimePercentage =
    aggregateUptimeRatio == null
      ? null
      : Math.min(100, Math.max(0, aggregateUptimeRatio * 100));

  return (
    <section className="h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="border-gray-200 border-b px-4 py-2.5 sm:px-5 sm:py-3 dark:border-gray-700">
        <h2 className="font-bold text-gray-900 text-sm leading-5 dark:text-gray-100">
          <FormattedMessage
            id="operator.aggregate_uptime"
            defaultMessage="Aggregate Uptime ({period})"
            values={{
              period: (
                <FormattedNumber
                  value={dateCount}
                  style="unit"
                  unit="day"
                  unitDisplay="long"
                />
              ),
            }}
          />
        </h2>
      </div>
      <div className="px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <span className="font-bold text-3xl text-gray-900 tracking-tight dark:text-white">
            {aggregateUptimeRatio != null ? (
              <FormattedNumber
                value={aggregateUptimeRatio}
                style="percent"
                maximumFractionDigits={2}
              />
            ) : (
              'N/A'
            )}
          </span>
          <p className="text-gray-500 text-xs leading-4 dark:text-gray-400">
            <FormattedMessage
              id="operator.aggregate_uptime_description"
              defaultMessage="Weighted average across all operated lines"
            />
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
          {uptimePercentage != null && (
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${uptimePercentage}%` }}
            />
          )}
        </div>
      </div>
    </section>
  );
};
