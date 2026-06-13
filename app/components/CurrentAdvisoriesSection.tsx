import { CheckCircleIcon } from '@heroicons/react/24/solid';
import type { IssueType } from '@mrtdown/core';
import {
  BuildingOfficeIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CogIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import classNames from 'classnames';
import { lazy, Suspense, useMemo, useState } from 'react';
import { defineMessage, FormattedMessage } from 'react-intl';
import type { Issue } from '~/types';
import { LineBar } from '~/components/LineBar';

const CurrentAdvisoriesDetails = lazy(() =>
  import('./CurrentAdvisoriesSection/Details').then((module) => ({
    default: module.CurrentAdvisoriesDetails,
  })),
);

const ISSUE_TYPES = [
  {
    type: 'disruption',
    message: defineMessage({
      id: 'general.active_disruptions',
      defaultMessage:
        '<bold>{count}</bold> Active {count, plural, one {Disruption} other {Disruptions}}',
    }),
    Icon: ExclamationTriangleIcon,
  },
  {
    type: 'maintenance',
    message: defineMessage({
      id: 'general.planned_maintenance',
      defaultMessage:
        '<bold>{count}</bold> Maintenance {count, plural, one {Work} other {Works}}',
    }),
    Icon: CogIcon,
  },
  {
    type: 'infra',
    message: defineMessage({
      id: 'general.infrastructure_works',
      defaultMessage:
        '<bold>{count}</bold> Infrastructure {count, plural, one {Work} other {Works}}',
    }),
    Icon: BuildingOfficeIcon,
  },
] as const;

interface Props {
  issuesActiveNow: Issue[];
  issuesActiveToday: Issue[];
  lineOperationalCount: number;
}

export const CurrentAdvisoriesSection: React.FC<Props> = (props) => {
  const { issuesActiveNow, issuesActiveToday, lineOperationalCount } = props;
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { issueCountsByType, issueLineIdsByType } = useMemo(() => {
    const countsByType: Partial<Record<IssueType, number>> = {};
    const lineIdsByType: Partial<Record<IssueType, Set<string>>> = {};

    const processIssues = (issues: Issue[]) => {
      for (const issue of issues) {
        countsByType[issue.type] = (countsByType[issue.type] ?? 0) + 1;
        for (const lineId of issue.lineIds) {
          const lineIds = lineIdsByType[issue.type] ?? new Set<string>();
          lineIds.add(lineId);
          lineIdsByType[issue.type] = lineIds;
        }
      }
    };

    processIssues(issuesActiveNow);
    processIssues(issuesActiveToday);

    return {
      issueCountsByType: countsByType,
      issueLineIdsByType: lineIdsByType,
    };
  }, [issuesActiveNow, issuesActiveToday]);

  const activeIssueCount = issuesActiveNow.length + issuesActiveToday.length;

  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 shrink space-y-3">
            <h2 className="font-bold text-gray-900 text-lg sm:text-xl dark:text-gray-100">
              <FormattedMessage
                id="site.landing.service_advisories"
                defaultMessage="Service Advisories"
              />
            </h2>
            <div className="grid grid-cols-1 gap-2 text-gray-800 sm:grid-cols-[repeat(auto-fit,_minmax(14rem,_1fr))] sm:gap-3 dark:text-gray-200">
              {ISSUE_TYPES.map(({ type, message, Icon }) => {
                const count = issueCountsByType[type] ?? 0;
                const lineIds = issueLineIdsByType[type] ?? new Set();
                return count > 0 ? (
                  <div
                    key={type}
                    className="flex min-w-0 flex-col items-start gap-1.5 rounded-lg bg-gray-50 p-2.5 text-xs sm:p-3 sm:text-sm min-[360px]:grid min-[360px]:grid-cols-[auto_1fr] min-[360px]:gap-x-2 min-[360px]:gap-y-1 dark:bg-gray-700/50"
                  >
                    <div
                      className={classNames(
                        'row-span-2 inline-flex size-5 shrink-0 items-center justify-center rounded-full shadow-sm ring-1 sm:size-7',
                        {
                          'bg-disruption-light/20 text-disruption-light ring-disruption-light/40 dark:bg-disruption-dark/30 dark:text-disruption-dark dark:ring-disruption-dark/60':
                            type === 'disruption',
                          'bg-maintenance-light/20 text-maintenance-light ring-maintenance-light/40 dark:bg-maintenance-dark/30 dark:text-maintenance-dark dark:ring-maintenance-dark/60':
                            type === 'maintenance',
                          'bg-infra-light/20 text-infra-light ring-infra-light/40 dark:bg-infra-dark/30 dark:text-infra-dark dark:ring-infra-dark/60':
                            type === 'infra',
                        },
                      )}
                    >
                      <Icon className="size-3.5 sm:size-5" />
                    </div>
                    <div className="flex min-w-0 items-center whitespace-pre-wrap leading-tight">
                      <FormattedMessage
                        {...message}
                        values={{
                          count,
                          bold: (chunks) => (
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              {chunks}
                            </span>
                          ),
                        }}
                      />
                    </div>
                    <LineBar lineIds={Array.from(lineIds).sort()} />
                  </div>
                ) : null;
              })}
              {lineOperationalCount > 0 && (
                <div className="flex min-w-0 flex-col items-start gap-1.5 rounded-lg bg-gray-50 p-2.5 text-xs sm:p-3 sm:text-sm min-[360px]:flex-row min-[360px]:items-center min-[360px]:gap-x-2 dark:bg-gray-700/50">
                  <div className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-operational-light/20 text-operational-light shadow-sm ring-1 ring-operational-light/40 sm:size-7 dark:bg-operational-dark/30 dark:text-operational-dark dark:ring-operational-dark/60">
                    <CheckCircleIcon className="size-3.5 sm:size-5" />
                  </div>
                  <div className="flex min-w-0 items-center whitespace-pre-wrap leading-tight">
                    <FormattedMessage
                      id="general.count_line_operational"
                      defaultMessage="<bold>{count}</bold> {count, plural, one {Line} other {Lines}} Operational"
                      values={{
                        count: lineOperationalCount,
                        bold: (chunks) => (
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {chunks}
                          </span>
                        ),
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {activeIssueCount > 0 && (
            <div className="flex w-full shrink-0 justify-center gap-2 sm:w-auto lg:justify-start">
              <button
                type="button"
                aria-expanded={detailsOpen}
                aria-controls="current-advisories-details"
                className="w-36 shrink-0 rounded-lg bg-accent-light px-3 py-2 font-medium text-sm text-white transition-all duration-200 hover:bg-accent-light/80 hover:shadow-md sm:rounded-xl sm:px-4 sm:py-2.5 dark:bg-accent-dark dark:hover:bg-accent-dark/80"
                onClick={() => setDetailsOpen((isOpen) => !isOpen)}
              >
                <div className="flex items-center justify-center gap-x-2 sm:justify-between">
                  {detailsOpen ? (
                    <>
                      <FormattedMessage
                        id="general.hide_details"
                        defaultMessage="Hide details"
                      />
                      <ChevronUpIcon className="size-4" />
                    </>
                  ) : (
                    <>
                      <FormattedMessage
                        id="general.show_details"
                        defaultMessage="Show details"
                      />
                      <ChevronDownIcon className="size-4" />
                    </>
                  )}
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
      {activeIssueCount > 0 && detailsOpen && (
        <Suspense
          fallback={
            <CurrentAdvisoriesDetailsSkeleton
              issuesActiveNow={issuesActiveNow}
              issuesActiveToday={issuesActiveToday}
            />
          }
        >
          <CurrentAdvisoriesDetails
            issuesActiveNow={issuesActiveNow}
            issuesActiveToday={issuesActiveToday}
            onClose={() => setDetailsOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
};

function CurrentAdvisoriesDetailsSkeleton(props: {
  issuesActiveNow: Issue[];
  issuesActiveToday: Issue[];
}) {
  return (
    <div
      id="current-advisories-details"
      className="mt-4 flex flex-col space-y-3"
    >
      {props.issuesActiveNow.map((issue) => (
        <CurrentAdvisoriesDetailsSkeletonCard key={`now-${issue.id}`} />
      ))}
      {props.issuesActiveToday.map((issue) => (
        <CurrentAdvisoriesDetailsSkeletonCard key={`today-${issue.id}`} />
      ))}
    </div>
  );
}

function CurrentAdvisoriesDetailsSkeletonCard() {
  return (
    <div className="flex flex-col rounded-xl border border-gray-300 bg-white px-4 py-3 shadow-sm sm:px-6 sm:py-4 dark:border-gray-600 dark:bg-gray-800">
      <div className="h-5 w-44 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-3 h-4 w-full max-w-xl rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-2 h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}
