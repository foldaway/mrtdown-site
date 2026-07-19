import { FormattedMessage, FormattedNumber } from 'react-intl';
import { Duration } from 'luxon';
import { FormattedDuration } from '~/components/FormattedDuration';
import type { OperatorProfile } from '~/util/dbQueries/operators';

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
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:col-span-2 dark:border-gray-700 dark:bg-gray-800">
      <div className="border-gray-200 border-b px-4 py-2.5 sm:px-5 sm:py-3 dark:border-gray-700">
        <h2 className="font-bold text-gray-900 text-sm leading-5 dark:text-gray-100">
          <FormattedMessage
            id="general.quick_facts"
            defaultMessage="Quick Facts"
          />
        </h2>
      </div>
      <div className="px-4 py-3 sm:px-5 sm:py-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <div>
            <dt className="text-gray-500 text-xs dark:text-gray-400">
              <FormattedMessage
                id="operator.total_stations"
                defaultMessage="Total Stations"
              />
            </dt>
            <dd className="mt-1 font-bold text-gray-900 text-xl tracking-tight dark:text-white">
              <FormattedNumber value={totalStationsOperated} />
            </dd>
          </div>

          {yearsOfOperation != null && (
            <div>
              <dt className="text-gray-500 text-xs dark:text-gray-400">
                <FormattedMessage
                  id="operator.years_of_operation"
                  defaultMessage="Years of Operation"
                />
              </dt>
              <dd className="mt-1 font-bold text-gray-900 text-xl tracking-tight dark:text-white">
                <FormattedNumber
                  value={yearsOfOperation}
                  maximumFractionDigits={1}
                />
              </dd>
            </div>
          )}

          {totalDowntimeDuration != null && (
            <div>
              <dt className="text-gray-500 text-xs dark:text-gray-400">
                <FormattedMessage
                  id="operator.total_downtime"
                  defaultMessage="Total Downtime (90 days)"
                />
              </dt>
              <dd className="mt-1 font-semibold text-gray-900 text-sm leading-5 dark:text-white">
                <FormattedDuration duration={totalDowntimeDuration} />
              </dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
};
