import { useIntl } from 'react-intl';
import { Link } from 'react-router';
import type { Issue, IssueInterval } from '~/client';
import { IssueSubtypeBadge } from '~/components/IssueSubtypeBadge';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { IssueAffectedBranchPill } from '../../IssueAffectedBranchPill';
import { IssueTimestamp } from './IssueTimestamp';

interface Props {
  issue: Issue;
  interval: IssueInterval;
}

export const IssueContent: React.FC<Props> = (props) => {
  const { issue, interval } = props;
  const intl = useIntl();

  return (
    <div className="mt-2 flex flex-col sm:mt-2">
      <Link
        className="mt-1.5 block hover:underline"
        to={buildLocaleAwareLink(`/issues/${issue.id}`, intl.locale)}
      >
        <h3 className="font-semibold text-gray-900 text-sm leading-tight dark:text-gray-100">
          {issue.titleTranslations[intl.locale] ?? issue.title}
        </h3>
      </Link>

      <div className="mt-1.5 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {issue.branchesAffected.map((branch) => (
            <IssueAffectedBranchPill
              key={`${branch.branchId}@${branch.lineId}`}
              branch={branch}
              className="min-w-0"
            />
          ))}
        </div>
      </div>

      <hr className="my-2 border-gray-100 dark:border-gray-700" />

      <div className="flex text-gray-500 text-xs dark:text-gray-400">
        {issue.subtypes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-gray-500 text-xs dark:text-gray-400">
            {issue.subtypes.map((subtype) => (
              <IssueSubtypeBadge
                key={subtype}
                type={issue.type}
                subtype={subtype}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex text-gray-500 text-xs sm:mt-3 sm:hidden sm:pt-2 dark:text-gray-400">
        <IssueTimestamp interval={interval} className="shrink-0" />
      </div>
    </div>
  );
};
