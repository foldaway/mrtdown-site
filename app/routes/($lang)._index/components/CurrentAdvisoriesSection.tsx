import { Collapsible } from 'radix-ui';
import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';
import type { Issue } from '~/client';
import { IssueCard } from '~/components/IssueCard';

interface Props {
  issuesOngoing: Issue[];
  lineOperationalCount: number;
}

export const CurrentAdvisoriesSection: React.FC<Props> = (props) => {
  const { issuesOngoing, lineOperationalCount } = props;

  const { disruptionCount, maintenanceCount, infraCount } = useMemo(() => {
    let _disruptionCount = 0;
    let _maintenanceCount = 0;
    let _infraCount = 0;

    for (const issue of issuesOngoing) {
      switch (issue.type) {
        case 'disruption': {
          _disruptionCount++;
          break;
        }
        case 'maintenance': {
          _maintenanceCount++;
          break;
        }
        case 'infra': {
          _infraCount++;
          break;
        }
      }
    }

    return {
      disruptionCount: _disruptionCount,
      maintenanceCount: _maintenanceCount,
      infraCount: _infraCount,
    };
  }, [issuesOngoing]);

  return (
    <Collapsible.Root>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 shrink space-y-4">
            <h2 className="font-bold text-gray-900 text-lg sm:text-xl dark:text-gray-100">
              <FormattedMessage
                id="site.landing.service_advisories"
                defaultMessage="Service Advisories"
              />
            </h2>
            <div className="grid grid-cols-1 gap-3 text-gray-800 sm:grid-cols-2 lg:grid-cols-4 dark:text-gray-200">
              {disruptionCount > 0 && (
                <div className="flex items-center gap-x-2 rounded-lg bg-gray-50 p-2.5 text-sm sm:p-3 dark:bg-gray-700/50">
                  <FormattedMessage
                    id="general.count_ongoing_disruptions"
                    defaultMessage="<badge>{count}</badge> Active {count, plural, one {Disruption} other {Disruptions}}"
                    values={{
                      count: disruptionCount,
                      badge: (chunks) => (
                        <div className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-disruption-light shadow-sm sm:size-7 dark:bg-disruption-dark">
                          <span className="font-bold text-white text-xs">
                            {chunks}
                          </span>
                        </div>
                      ),
                    }}
                  />
                </div>
              )}
              {maintenanceCount > 0 && (
                <div className="flex items-center gap-x-2 rounded-lg bg-gray-50 p-2.5 text-sm sm:p-3 dark:bg-gray-700/50">
                  <FormattedMessage
                    id="general.count_ongoing_maintenance"
                    defaultMessage="<badge>{count}</badge> Planned Maintenance"
                    values={{
                      count: maintenanceCount,
                      badge: (chunks) => (
                        <div className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-maintenance-light shadow-sm sm:size-7 dark:bg-maintenance-dark">
                          <span className="font-bold text-white text-xs">
                            {chunks}
                          </span>
                        </div>
                      ),
                    }}
                  />
                </div>
              )}
              {infraCount > 0 && (
                <div className="flex items-center gap-x-2 rounded-lg bg-gray-50 p-2.5 text-sm sm:p-3 dark:bg-gray-700/50">
                  <FormattedMessage
                    id="general.count_ongoing_infrastructure"
                    defaultMessage="<badge>{count}</badge> Infrastructure {count, plural, one {Work} other {Works}}"
                    values={{
                      count: infraCount,
                      badge: (chunks) => (
                        <div className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-infra-light shadow-sm sm:size-7 dark:bg-infra-dark">
                          <span className="font-bold text-white text-xs">
                            {chunks}
                          </span>
                        </div>
                      ),
                    }}
                  />
                </div>
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

          <Collapsible.Trigger className="group w-30 shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-sm text-white transition-all duration-200 hover:bg-blue-700 hover:shadow-md dark:bg-blue-700 dark:hover:bg-blue-600">
            <span className="group-data-[state=open]:hidden">
              <FormattedMessage
                id="general.show_details"
                defaultMessage="Show details"
              />
            </span>
            <span className="group-data-[state=closed]:hidden">
              <FormattedMessage
                id="general.hide_details"
                defaultMessage="Hide details"
              />
            </span>
          </Collapsible.Trigger>
        </div>
      </div>
      <Collapsible.Content asChild>
        <div className="mt-4 space-y-3">
          {issuesOngoing.map((issue) => (
            <IssueCard key={issue.id} issue={issue} className="!w-auto" />
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
