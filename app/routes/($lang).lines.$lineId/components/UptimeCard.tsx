import { FormattedMessage, FormattedNumber } from 'react-intl';
import type { LineSummary } from '~/client';

interface Props {
  lineSummary: LineSummary;
  dateCount: number;
}

export const UptimeCard: React.FC<Props> = (props) => {
  const { lineSummary, dateCount } = props;

  return (
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 text-gray-800 shadow-lg md:col-span-3 dark:border-gray-700 dark:text-gray-200">
      <span className="mb-2 font-semibold text-base text-gray-900 dark:text-white">
        <FormattedMessage
          id="general.uptime_this_period"
          defaultMessage="Uptime ({period})"
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
        {lineSummary.uptimeRatio != null ? (
          <FormattedNumber
            value={lineSummary.uptimeRatio}
            style="percent"
            maximumFractionDigits={2}
          />
        ) : (
          'N/A'
        )}
      </span>
    </div>
  );
};
