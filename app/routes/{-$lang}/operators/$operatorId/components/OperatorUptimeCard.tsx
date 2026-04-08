import { FormattedMessage, FormattedNumber } from 'react-intl';

interface Props {
  aggregateUptimeRatio: number | null;
  dateCount: number;
}

export const OperatorUptimeCard: React.FC<Props> = (props) => {
  const { aggregateUptimeRatio, dateCount } = props;

  return (
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 text-gray-800 shadow-lg md:col-span-3 dark:border-gray-700 dark:text-gray-200">
      <span className="mb-2 font-semibold text-base text-gray-900 dark:text-white">
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
      </span>
      <span className="font-bold text-4xl">
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
      <span className="mt-1 text-gray-500 text-xs dark:text-gray-400">
        <FormattedMessage
          id="operator.aggregate_uptime_description"
          defaultMessage="Weighted average across all operated lines"
        />
      </span>
    </div>
  );
};

