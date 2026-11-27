import { Link } from '@tanstack/react-router';
import { useIntl } from 'react-intl';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { Issue, IssueInterval } from '~/types';
import { AffectedAreaSummary } from './AffectedAreaSummary';
import { IssueTimestamp } from './IssueTimestamp';

interface Props {
  issue: Issue;
  interval: IssueInterval;
}

export const IssueContent: React.FC<Props> = (props) => {
  const { issue, interval } = props;
  const intl = useIntl();

  return (
    <div className="flex flex-col">
      <Link
        className="mt-1 block hover:underline"
        to="/{-$lang}/issues/$issueId"
        params={{ issueId: issue.id }}
      >
        <h3 className="font-semibold text-gray-900 text-sm leading-tight dark:text-gray-100">
          {getLocalizedTranslation(issue.title, intl.locale)}
        </h3>
      </Link>

      <AffectedAreaSummary interval={interval} />

      <div className="mt-1.5 flex text-gray-500 text-xs sm:hidden dark:text-gray-400">
        <IssueTimestamp interval={interval} className="shrink-0" />
      </div>
    </div>
  );
};
