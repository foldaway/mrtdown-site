import { FormattedMessage } from 'react-intl';
import type { Issue } from '~/client';
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

  return (
    <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
      {issue.type === 'disruption' && <Disruption issue={issue} />}
      {issue.type === 'maintenance' && <Maintenance issue={issue} />}
      {issue.type === 'infra' && <Infrastructure issue={issue} />}

      <div className="flex flex-col gap-y-1">
        <dt className="text-gray-500 text-xs uppercase dark:text-gray-400">
          <FormattedMessage
            id="general.affected_stations"
            defaultMessage="Affected stations"
          />
        </dt>
        <dd className="flex flex-wrap items-center gap-2">
          {issue.branchesAffected.map((branch) => (
            <IssueAffectedBranchPill
              key={`${branch.branchId}@${branch.lineId}`}
              branch={branch}
            />
          ))}
        </dd>
      </div>

      {issue.subtypes.length > 0 && (
        <div className="flex flex-col gap-y-1">
          <dt className="text-gray-500 text-xs uppercase dark:text-gray-400">
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
