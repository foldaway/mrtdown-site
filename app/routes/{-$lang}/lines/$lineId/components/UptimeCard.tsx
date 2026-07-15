import { FormattedMessage, FormattedNumber } from 'react-intl';
import type { LineSummary } from '~/types';

interface Props {
  lineSummary: LineSummary;
  dateCount: number;
}

export const UptimeCard: React.FC<Props> = (props) => {
  const { lineSummary, dateCount } = props;

  const showRank =
    lineSummary.uptimeRank != null && lineSummary.totalLines != null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] content-start items-center gap-x-3 gap-y-2 px-4 py-3 text-gray-800 sm:px-5 sm:py-4 dark:text-gray-200">
      <h2 className="font-semibold text-gray-900 text-sm leading-5 dark:text-gray-100">
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
      </h2>
      <span className="col-start-2 row-span-2 row-start-1 font-bold text-2xl tracking-tight sm:text-3xl">
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
      {showRank && (
        <span className="col-start-1 row-start-2 text-gray-500 text-xs leading-4 dark:text-gray-400">
          <FormattedMessage
            id="general.uptime_rank"
            defaultMessage="Ranked #{rank} out of {total} {total, plural, one {line} other {lines}}"
            values={{
              rank: lineSummary.uptimeRank,
              total: lineSummary.totalLines,
            }}
          />
        </span>
      )}
    </div>
  );
};
