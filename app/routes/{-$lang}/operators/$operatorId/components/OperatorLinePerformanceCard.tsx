import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { Link } from '@tanstack/react-router';
import classNames from 'classnames';
import type React from 'react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';
import { LineSummaryStatusLabels } from '~/constants';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { OperatorProfile } from '~/util/dbQueries/operators';

interface Props {
  linePerformanceComparison: OperatorProfile['linePerformanceComparison'];
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
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-800 shadow-sm md:col-span-12 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
      <div className="flex items-center justify-between gap-3 border-gray-200 border-b px-4 py-2.5 sm:px-5 sm:py-3 dark:border-gray-700">
        <h2 className="font-semibold text-base text-gray-900 dark:text-white">
          <FormattedMessage
            id="operator.line_performance"
            defaultMessage="Line Performance Comparison"
          />
        </h2>
        <span className="rounded-full bg-gray-200 px-2.5 py-1 font-medium text-gray-600 text-xs dark:bg-gray-700 dark:text-gray-300">
          <FormattedNumber value={linePerformanceComparison.length} />{' '}
          <FormattedMessage id="general.lines" defaultMessage="Lines" />
        </span>
      </div>
      <div className="hidden grid-cols-[minmax(13rem,2.2fr)_minmax(8rem,1.2fr)_6rem_6rem] gap-4 border-gray-200 border-b px-5 py-2 lg:grid dark:border-gray-700">
        <span className="font-medium text-[10px] text-gray-400 uppercase tracking-wide dark:text-gray-500">
          <FormattedMessage id="general.line" defaultMessage="Line" />
        </span>
        <span className="font-medium text-[10px] text-gray-400 uppercase tracking-wide dark:text-gray-500">
          <FormattedMessage
            id="general.current_status"
            defaultMessage="Current Status"
          />
        </span>
        <span className="text-right font-medium text-[10px] text-gray-400 uppercase tracking-wide dark:text-gray-500">
          <FormattedMessage id="general.uptime" defaultMessage="Uptime" />
        </span>
        <span className="text-right font-medium text-[10px] text-gray-400 uppercase tracking-wide dark:text-gray-500">
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
        </span>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {linePerformanceComparison.map((performance) => {
          const line = included.lines[performance.lineId];
          if (line == null) {
            return null;
          }
          const lineName = getLocalizedTranslation(line.name, intl.locale);

          return (
            <article
              key={performance.lineId}
              className="group relative grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 transition-colors hover:bg-gray-50 sm:px-5 lg:grid-cols-[minmax(13rem,2.2fr)_minmax(8rem,1.2fr)_6rem_6rem] lg:items-center lg:gap-4 dark:hover:bg-gray-900/30"
            >
              <div className="col-span-2 min-w-0 lg:col-span-1">
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex min-w-11 shrink-0 items-center justify-center rounded-lg px-2 py-1.5 font-bold text-sm text-white shadow-sm"
                    style={{ backgroundColor: line.color }}
                  >
                    {performance.lineId}
                  </span>
                  <div className="min-w-0">
                    <Link
                      to="/{-$lang}/lines/$lineId"
                      params={{ lineId: performance.lineId }}
                      className="inline-flex max-w-full items-center gap-1 font-semibold text-gray-900 text-sm transition-colors after:absolute after:inset-0 group-hover:text-accent-light dark:text-gray-100"
                    >
                      <span className="truncate">{lineName}</span>
                      <ArrowRightIcon className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </div>
              </div>

              <PerformanceValue
                label={
                  <FormattedMessage
                    id="general.current_status"
                    defaultMessage="Current Status"
                  />
                }
              >
                <span
                  className={classNames(
                    'inline-flex items-center gap-1.5 font-medium text-xs',
                    {
                      'text-disruption-light dark:text-disruption-dark':
                        performance.status === 'ongoing_disruption',
                      'text-maintenance-light dark:text-maintenance-dark':
                        performance.status === 'ongoing_maintenance',
                      'text-infra-light dark:text-infra-dark':
                        performance.status === 'ongoing_infra',
                      'text-operational-light dark:text-operational-dark':
                        performance.status === 'normal',
                      'text-gray-500 dark:text-gray-400':
                        performance.status === 'closed_for_day' ||
                        performance.status === 'future_service',
                    },
                  )}
                >
                  <span
                    className={classNames('size-2 shrink-0 rounded-full', {
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
                  <FormattedMessage
                    {...LineSummaryStatusLabels[performance.status]}
                  />
                </span>
              </PerformanceValue>

              <PerformanceValue
                label={
                  <FormattedMessage
                    id="general.uptime"
                    defaultMessage="Uptime"
                  />
                }
                className="lg:text-right"
              >
                {performance.uptimeRatio != null ? (
                  <span className="font-semibold tabular-nums">
                    <FormattedNumber
                      value={performance.uptimeRatio}
                      style="percent"
                      maximumFractionDigits={2}
                    />
                  </span>
                ) : (
                  <span className="text-gray-500 text-xs dark:text-gray-400">
                    N/A
                  </span>
                )}
              </PerformanceValue>

              <PerformanceValue
                label={
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
                }
                className="lg:text-right"
              >
                <span className="font-semibold tabular-nums">
                  <FormattedNumber value={performance.issueCount} />
                </span>
              </PerformanceValue>
            </article>
          );
        })}
      </div>
    </section>
  );
};

function PerformanceValue({
  label,
  className,
  children,
}: {
  label: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={classNames(
        'min-w-0 text-gray-700 text-xs dark:text-gray-300',
        className,
      )}
    >
      <p className="mb-1 font-medium text-[10px] text-gray-400 uppercase tracking-wide lg:hidden dark:text-gray-500">
        {label}
      </p>
      {children}
    </div>
  );
}
