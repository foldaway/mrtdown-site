import classNames from 'classnames';
import { Link } from 'react-router';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';
import type { OperatorLinePerformance } from '~/client';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { LineSummaryStatusLabels } from '~/constants';

interface Props {
  linePerformanceComparison: OperatorLinePerformance[];
  dateCount: number;
}

export const OperatorLinePerformanceCard: React.FC<Props> = (props) => {
  const { linePerformanceComparison, dateCount } = props;
  const included = useIncludedEntities();
  const intl = useIntl();

  if (linePerformanceComparison.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col rounded-lg border border-gray-300 p-6 text-gray-800 shadow-lg md:col-span-12 dark:border-gray-700 dark:text-gray-200">
      <span className="mb-4 font-semibold text-base text-gray-900 dark:text-white">
        <FormattedMessage
          id="operator.line_performance"
          defaultMessage="Line Performance Comparison"
        />
      </span>
      <div className="flex flex-col gap-3">
        {linePerformanceComparison.map((performance) => {
          const line = included.lines[performance.lineId];
          if (line == null) {
            return null;
          }
          const lineName =
            line.titleTranslations[intl.locale] ?? line.title;

          return (
            <Link
              key={performance.lineId}
              className="group flex items-center gap-4 rounded-lg border border-gray-300 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
              to={buildLocaleAwareLink(
                `/lines/${performance.lineId}`,
                intl.locale,
              )}
            >
              <span
                className="rounded-md px-2 py-1 font-semibold text-white text-xs leading-none"
                style={{ backgroundColor: line.color }}
              >
                {performance.lineId}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 text-sm group-hover:underline dark:text-gray-100">
                    {lineName}
                  </span>
                  <div
                    className={classNames('size-2 rounded-full', {
                      'bg-disruption-light dark:bg-disruption-dark':
                        performance.status === 'ongoing_disruption',
                      'bg-maintenance-light dark:bg-maintenance-dark':
                        performance.status === 'ongoing_maintenance',
                      'bg-infra-light dark:bg-infra-dark':
                        performance.status === 'ongoing_infra',
                      'bg-operational-light dark:bg-operational-dark':
                        performance.status === 'normal',
                      'bg-gray-400 dark:bg-gray-500':
                        performance.status === 'closed_for_day' ||
                        performance.status === 'future_service',
                    })}
                  />
                  <span className="text-gray-600 text-xs dark:text-gray-400">
                    <FormattedMessage
                      {...LineSummaryStatusLabels[performance.status]}
                    />
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {performance.uptimeRatio != null ? (
                  <div className="text-right">
                    <div className="font-semibold text-gray-900 text-sm dark:text-gray-100">
                      <FormattedNumber
                        value={performance.uptimeRatio}
                        style="percent"
                        maximumFractionDigits={2}
                      />
                    </div>
                    <div className="text-gray-500 text-xs dark:text-gray-400">
                      <FormattedMessage
                        id="general.uptime"
                        defaultMessage="Uptime"
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-gray-500 text-xs dark:text-gray-400">
                    N/A
                  </span>
                )}
                <div className="text-right">
                  <div className="font-semibold text-gray-900 text-sm dark:text-gray-100">
                    <FormattedNumber value={performance.issueCount} />
                  </div>
                  <div className="text-gray-500 text-xs dark:text-gray-400">
                    <FormattedMessage
                      id="operator.line_issues_count"
                      defaultMessage="Issues ({period})"
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
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

