import { Duration } from 'luxon';
import { useMemo } from 'react';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';
import type { Issue } from '~/client';
import { FormattedDuration } from '~/components/FormattedDuration';
import { IssueAffectedBranchPill } from '~/components/IssueAffectedBranchPill';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { Disruption } from './components/Disruption';
import { Infrastructure } from './components/Infrastructure';
import { Maintenance } from './components/Maintenance';

interface Props {
  issue: Issue;
}

export const Attributes: React.FC<Props> = (props) => {
  const { issue } = props;
  const { intervals } = issue;

  const intl = useIntl();
  const { lines } = useIncludedEntities();

  const affectedLines = useMemo(() => {
    return issue.lineIds.map((lineId) => lines[lineId]);
  }, [issue.lineIds, lines]);

  return (
    <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
      {issue.type === 'disruption' && <Disruption issue={issue} />}
      {issue.type === 'maintenance' && <Maintenance issue={issue} />}
      {issue.type === 'infra' && <Infrastructure issue={issue} />}

      <div>
        <dt className="text-gray-500 text-xs uppercase dark:text-gray-400">
          <FormattedMessage
            id="general.affected_lines"
            defaultMessage="Affected lines"
          />
        </dt>
        <dd>
          {affectedLines.map((line) => (
            <span
              key={line.id}
              className="rounded px-1.5 py-0.5 font-semibold text-white text-xs"
              style={{ backgroundColor: line.color }}
            >
              {line.titleTranslations[intl.locale] ?? line.title}
            </span>
          ))}
        </dd>
      </div>

      <div>
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
    </dl>
  );
};
