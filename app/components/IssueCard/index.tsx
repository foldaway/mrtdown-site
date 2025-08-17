import classNames from 'classnames';
import type { Issue } from '~/client';
import { IssueContent } from './components/IssueContent';
import { IssueHeader } from './components/IssueHeader';
import { useIssueInterval } from './hooks/useIssueInterval';
import type { IssueCardContext } from './types';

const CONTEXT_DEFAULT: IssueCardContext = {
  type: 'now',
};

interface Props {
  issue: Issue;
  className?: string;
  /** @default now */
  context?: IssueCardContext;
}

export const IssueCard: React.FC<Props> = (props) => {
  const { issue, className, context = CONTEXT_DEFAULT } = props;

  const interval = useIssueInterval(issue, context);

  if (interval == null) {
    return null;
  }

  return (
    <div
      className={classNames(
        'flex shrink-0 flex-col rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-800 shadow-sm transition-all hover:border-gray-400 hover:shadow-md sm:px-6 sm:py-4 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500',
        className,
      )}
    >
      <IssueHeader issue={issue} interval={interval} />
      <IssueContent issue={issue} interval={interval} />
    </div>
  );
};
