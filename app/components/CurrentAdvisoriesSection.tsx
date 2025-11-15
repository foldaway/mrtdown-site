import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { DateTime } from 'luxon';
import { Collapsible } from 'radix-ui';
import { useMemo } from 'react';
import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl';
import type { Issue, IssueType } from '~/client';
import { IssueCard } from '~/components/IssueCard';
import { LineBar } from '~/components/LineBar';
import type { IssueCardContext } from './IssueCard/types';

const ISSUE_CARD_CONTEXT_NOW: IssueCardContext = {
  type: 'now',
};

const ISSUE_TYPES = [
  {
    type: 'disruption',
    messageId: 'general.active_disruptions',
    defaultMessage:
      'Active {count, plural, one {Disruption} other {Disruptions}}',
    bgClass: 'bg-disruption-light dark:bg-disruption-dark',
  },
  {
    type: 'maintenance',
    messageId: 'general.planned_maintenance',
    defaultMessage:
      'Planned Maintenance {count, plural, one {} other {Activities}}',
    bgClass: 'bg-maintenance-light dark:bg-maintenance-dark',
  },
  {
    type: 'infra',
    messageId: 'general.infrastructure_works',
    defaultMessage: 'Infrastructure {count, plural, one {Work} other {Works}}',
    bgClass: 'bg-infra-light dark:bg-infra-dark',
  },
] as const;

interface Props {
  issuesActiveNow: Issue[];
  issuesActiveToday: Issue[];
  lineOperationalCount: number;
}

export const CurrentAdvisoriesSection: React.FC<Props> = (props) => {
  const { issuesActiveNow, issuesActiveToday, lineOperationalCount } = props;

  const intl = useIntl();
  const { issueCountsByType, issueLineIdsByType } = useMemo(() => {
    const countsByType: Partial<Record<IssueType, number>> = {};
    const lineIdsByType: Partial<Record<IssueType, Set<string>>> = {};

    const processIssues = (issues: Issue[]) => {
      for (const issue of issues) {
        countsByType[issue.type] = (countsByType[issue.type] ?? 0) + 1;
        for (const lineId of issue.lineIds) {
          lineIdsByType[issue.type] ??= new Set();
          lineIdsByType[issue.type]!.add(lineId);
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

  const issueCardContextToday = useMemo<IssueCardContext>(() => {
    return {
      type: 'history.days',
      date: DateTime.now().toISO(),
      days: 1,
    };
  }, []);

  return (
    <Collapsible.Root>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 shrink space-y-4">
            <h2 className="font-bold text-gray-900 text-lg sm:text-xl dark:text-gray-100">
              <FormattedMessage
                id="site.landing.service_advisories"
                defaultMessage="Service Advisories"
              />
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-3 text-gray-800 dark:text-gray-200">
              {ISSUE_TYPES.map(
                ({ type, messageId, defaultMessage, bgClass }) => {
                  const count = issueCountsByType[type] ?? 0;
                  const lineIds = issueLineIdsByType[type] ?? new Set();
                  return count > 0 ? (
                    <div
                      key={type}
                      className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-lg bg-gray-50 p-2.5 text-sm sm:p-3 dark:bg-gray-700/50"
                    >
                      <div
                        className={`row-span-2 inline-flex size-6 shrink-0 items-center justify-center rounded-full shadow-sm sm:size-7 ${bgClass}`}
                      >
                        <span className="font-bold text-sm text-white">
                          <FormattedNumber value={count} />
                        </span>
                      </div>
                      <FormattedMessage
                        id={messageId}
                        defaultMessage={defaultMessage}
                        values={{ count }}
                      />
                      <LineBar lineIds={Array.from(lineIds).sort()} />
                    </div>
                  ) : null;
                },
              )}
              {lineOperationalCount > 0 && (
                <div className="flex items-center gap-x-2 rounded-lg bg-gray-50 p-2.5 text-sm sm:p-3 dark:bg-gray-700/50">
                  <FormattedMessage
                    id="general.count_line_operational"
                    defaultMessage="<badge>{count}</badge> {count, plural, one {Line} other {Lines}} Operational"
                    values={{
                      count: lineOperationalCount,
                      badge: (chunks) => (
                        <div className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-operational-light shadow-sm sm:size-7 dark:bg-operational-dark">
                          <span className="font-bold text-white text-xs">
                            {chunks}
                          </span>
                        </div>
                      ),
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <Collapsible.Trigger className="group w-36 shrink-0 rounded-xl bg-accent-light px-4 py-2.5 font-medium text-sm text-white transition-all duration-200 hover:bg-accent-light/80 hover:shadow-md dark:bg-accent-dark dark:hover:bg-accent-dark/80">
              <div className="flex items-center justify-between gap-x-2 group-data-[state=open]:hidden">
                <FormattedMessage
                  id="general.show_details"
                  defaultMessage="Show details"
                />
                <ChevronDownIcon className="size-4" />
              </div>
              <div className="flex items-center justify-between group-data-[state=closed]:hidden">
                <FormattedMessage
                  id="general.hide_details"
                  defaultMessage="Hide details"
                />
                <ChevronUpIcon className="size-4" />
              </div>
            </Collapsible.Trigger>
          </div>
        </div>
      </div>
      <Collapsible.Content asChild>
        <div className="mt-4 flex flex-col space-y-3">
          {issuesActiveNow.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              className="!w-auto"
              context={ISSUE_CARD_CONTEXT_NOW}
            />
          ))}
          {issuesActiveToday.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              className="!w-auto"
              context={issueCardContextToday}
            />
          ))}
          <Collapsible.Trigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-x-2 self-center rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:focus:ring-accent-dark dark:hover:bg-gray-700"
            >
              <FormattedMessage
                id="general.hide_details"
                defaultMessage="Hide details"
              />
              <ChevronUpIcon className="size-4" />
            </button>
          </Collapsible.Trigger>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
