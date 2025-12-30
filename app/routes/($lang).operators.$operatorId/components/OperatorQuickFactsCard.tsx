import { FormattedMessage, FormattedNumber } from 'react-intl';
import { Duration } from 'luxon';
import type { OperatorProfile } from '~/client';
import { FormattedDuration } from '~/components/FormattedDuration';

interface Props {
  operatorProfile: OperatorProfile;
}

export const OperatorQuickFactsCard: React.FC<Props> = (props) => {
  const { operatorProfile } = props;
  const {
    totalStationsOperated,
    yearsOfOperation,
    totalDowntimeDurationSeconds,
  } = operatorProfile;

  const totalDowntimeDuration =
    totalDowntimeDurationSeconds > 0
      ? Duration.fromObject({ seconds: totalDowntimeDurationSeconds })
      : null;

  return (
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 text-gray-800 shadow-lg md:col-span-5 dark:border-gray-700 dark:text-gray-200">
      <span className="mb-2 font-semibold text-base text-gray-900 dark:text-white">
        <FormattedMessage
          id="general.quick_facts"
          defaultMessage="Quick Facts"
        />
      </span>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-sm">
          <FormattedMessage
            id="operator.total_stations"
            defaultMessage="Total Stations"
          />
        </span>
        <span className="justify-self-end font-medium text-sm">
          <FormattedNumber value={totalStationsOperated} />
        </span>

        {yearsOfOperation != null && (
          <>
            <span className="text-sm">
              <FormattedMessage
                id="operator.years_of_operation"
                defaultMessage="Years of Operation"
              />
            </span>
            <span className="justify-self-end font-medium text-sm">
              <FormattedNumber
                value={yearsOfOperation}
                maximumFractionDigits={1}
              />
            </span>
          </>
        )}

        {totalDowntimeDuration != null && (
          <>
            <span className="text-sm">
              <FormattedMessage
                id="operator.total_downtime"
                defaultMessage="Total Downtime (90 days)"
              />
            </span>
            <span className="justify-self-end font-medium text-sm">
              <FormattedDuration duration={totalDowntimeDuration} />
            </span>
          </>
        )}
      </div>
    </div>
  );
};

