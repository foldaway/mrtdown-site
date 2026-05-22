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
import { DateTime } from 'luxon';
import { Collapsible } from 'radix-ui';
import { useMemo } from 'react';
import { defineMessage, FormattedMessage } from 'react-intl';
import type { Issue } from '~/types';
import { IssueCard } from '~/components/IssueCard';
import { LineBar } from '~/components/LineBar';
import type { IssueCardContext } from './IssueCard/types';

const ISSUE_CARD_CONTEXT_NOW: IssueCardContext = {
  type: 'now',
};

const ISSUE_TYPES = [
  {
    type: 'disruption',
    label: defineMessage({
      id: 'general.disruptions',
      defaultMessage: 'Disruptions',
    }),
    Icon: ExclamationTriangleIcon,
  },
  {
    type: 'maintenance',
    label: defineMessage({
      id: 'general.maintenance',
      defaultMessage: 'Maintenance',
    }),
    Icon: CogIcon,
  },
  {
    type: 'infra',
    label: defineMessage({
      id: 'general.infrastructure',
      defaultMessage: 'Infrastructure',
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

  const issueCardContextToday = useMemo<IssueCardContext>(() => {
    return {
      type: 'history.days',
      date: DateTime.now().toISODate(),
      days: 1,
    };
  }, []);

  const activeIssueCount = issuesActiveNow.length + issuesActiveToday.length;

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
            <div className="grid grid-cols-2 gap-2 text-gray-800 sm:gap-3 lg:grid-cols-4 dark:text-gray-200">
              {ISSUE_TYPES.map(({ type, label, Icon }) => {
                const count = issueCountsByType[type] ?? 0;
                const lineIds = issueLineIdsByType[type] ?? new Set();
                return (
                  <AdvisorySummaryTile
                    count={count}
                    Icon={Icon}
                    key={type}
                    label={<FormattedMessage {...label} />}
                    lineIds={Array.from(lineIds).sort()}
                    tone={type}
                  />
                );
              })}
              <AdvisorySummaryTile
                count={lineOperationalCount}
                Icon={CheckCircleIcon}
                label={
                  <FormattedMessage
                    id="status.operational"
                    defaultMessage="Operational"
                  />
                }
                tone="operational"
              />
            </div>
          </div>

          {activeIssueCount > 0 && (
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
          )}
        </div>
      </div>
      {activeIssueCount > 0 && (
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
      )}
    </Collapsible.Root>
  );
};

interface AdvisorySummaryTileProps {
  count: number;
  Icon: React.ComponentType<React.ComponentProps<'svg'>>;
  label: React.ReactNode;
  lineIds?: string[];
  tone: IssueType | 'operational';
}

const AdvisorySummaryTile: React.FC<AdvisorySummaryTileProps> = (props) => {
  const { count, Icon, label, lineIds = [], tone } = props;
  const hasActiveIssues = tone !== 'operational' && count > 0;

  return (
    <div
      className={classNames(
        'flex min-h-28 min-w-0 flex-col justify-between rounded-xl border p-3 shadow-sm sm:min-h-32 sm:p-4',
        {
          'border-disruption-light/25 bg-disruption-light/5 dark:border-disruption-dark/35 dark:bg-disruption-dark/10':
            tone === 'disruption' && hasActiveIssues,
          'border-maintenance-light/25 bg-maintenance-light/5 dark:border-maintenance-dark/35 dark:bg-maintenance-dark/10':
            tone === 'maintenance' && hasActiveIssues,
          'border-infra-light/25 bg-infra-light/5 dark:border-infra-dark/35 dark:bg-infra-dark/10':
            tone === 'infra' && hasActiveIssues,
          'border-operational-light/25 bg-operational-light/5 dark:border-operational-dark/35 dark:bg-operational-dark/10':
            tone === 'operational',
          'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-700/40':
            tone !== 'operational' && !hasActiveIssues,
        },
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-600 text-xs dark:text-gray-300">
            {label}
          </p>
          <p className="mt-1 font-bold text-3xl text-gray-950 tabular-nums leading-none sm:text-4xl dark:text-gray-50">
            {count}
          </p>
        </div>
        <div
          className={classNames(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 sm:size-9',
            {
              'bg-disruption-light/15 text-disruption-light ring-disruption-light/25 dark:bg-disruption-dark/20 dark:text-disruption-dark dark:ring-disruption-dark/30':
                tone === 'disruption',
              'bg-maintenance-light/15 text-maintenance-light ring-maintenance-light/25 dark:bg-maintenance-dark/20 dark:text-maintenance-dark dark:ring-maintenance-dark/30':
                tone === 'maintenance',
              'bg-infra-light/15 text-infra-light ring-infra-light/25 dark:bg-infra-dark/20 dark:text-infra-dark dark:ring-infra-dark/30':
                tone === 'infra',
              'bg-operational-light/15 text-operational-light ring-operational-light/25 dark:bg-operational-dark/20 dark:text-operational-dark dark:ring-operational-dark/30':
                tone === 'operational',
            },
          )}
        >
          <Icon className="size-5" />
        </div>
      </div>

      <div className="mt-3 min-h-5 text-gray-500 text-xs dark:text-gray-400">
        {lineIds.length > 0 ? (
          <LineBar lineIds={lineIds} />
        ) : tone === 'operational' ? (
          <FormattedMessage
            id="general.lines_in_service"
            defaultMessage="{count, plural, one {line in service} other {lines in service}}"
            values={{ count }}
          />
        ) : (
          <FormattedMessage
            id="general.no_lines_affected"
            defaultMessage="No lines affected"
          />
        )}
      </div>
    </div>
  );
};
