import { FormattedMessage } from 'react-intl';
import type { Issue } from '~/types';
import { IssueAffectedBranchPill } from '~/components/IssueAffectedBranchPill';
import { IssueSubtypeBadge } from '~/components/IssueSubtypeBadge';
import { Disruption } from './components/Disruption';
import { Infrastructure } from './components/Infrastructure';
import { Maintenance } from './components/Maintenance';

interface Props {
  issue: Issue;
}

export const Attributes: React.FC<Props> = (props) => {
  const { issue } = props;
  const hasAffectedServices = issue.branchesAffected.some(
    (branch) => branch.serviceName != null,
  );

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
      {issue.type === 'disruption' && <Disruption issue={issue} />}
      {issue.type === 'maintenance' && <Maintenance issue={issue} />}
      {issue.type === 'infra' && <Infrastructure issue={issue} />}

      <div className="flex flex-col gap-y-1">
        <dt className="font-medium text-[11px] text-gray-500 uppercase tracking-wide dark:text-gray-400">
          {hasAffectedServices ? (
            <FormattedMessage
              id="general.affected_services"
              defaultMessage="Affected services"
            />
          ) : (
            <FormattedMessage
              id="general.affected_stations"
              defaultMessage="Affected stations"
            />
          )}
        </dt>
        <dd className="flex flex-col items-stretch gap-2">
          {issue.branchesAffected.map((branch) => (
            <IssueAffectedBranchPill
              key={`${branch.branchId}@${branch.lineId}`}
              branch={branch}
              issue={issue}
            />
          ))}
        </dd>
      </div>

      {issue.subtypes.length > 0 && (
        <div className="flex flex-col gap-y-1">
          <dt className="font-medium text-[11px] text-gray-500 uppercase tracking-wide dark:text-gray-400">
            <FormattedMessage id="general.subtypes" defaultMessage="Subtypes" />
          </dt>
          <dd className="flex flex-wrap items-center gap-2">
            {issue.subtypes.map((subtype) => (
              <IssueSubtypeBadge
                key={subtype}
                type={issue.type}
                subtype={subtype}
              />
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
};
