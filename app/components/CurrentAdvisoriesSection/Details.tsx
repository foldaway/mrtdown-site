import { ChevronUpIcon } from '@heroicons/react/24/outline';
import { DateTime } from 'luxon';
import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';
import { IssueCard } from '~/components/IssueCard';
import type { Issue } from '~/types';
import type { IssueCardContext } from '../IssueCard/types';

const ISSUE_CARD_CONTEXT_NOW: IssueCardContext = {
  type: 'now',
};

interface Props {
  issuesActiveNow: Issue[];
  issuesActiveToday: Issue[];
  onClose: () => void;
}

export function CurrentAdvisoriesDetails(props: Props) {
  const { issuesActiveNow, issuesActiveToday, onClose } = props;

  const issueCardContextToday = useMemo<IssueCardContext>(() => {
    return {
      type: 'history.days',
      date: DateTime.now().toISODate(),
      days: 1,
    };
  }, []);

  return (
    <div
      id="current-advisories-details"
      className="mt-4 flex flex-col space-y-3"
    >
      {issuesActiveNow.map((issue) => (
        <IssueCard
          key={`now-${issue.id}`}
          issue={issue}
          className="!w-auto"
          context={ISSUE_CARD_CONTEXT_NOW}
        />
      ))}
      {issuesActiveToday.map((issue) => (
        <IssueCard
          key={`today-${issue.id}`}
          issue={issue}
          className="!w-auto"
          context={issueCardContextToday}
        />
      ))}
      <button
        type="button"
        className="inline-flex items-center gap-x-2 self-center rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:focus:ring-accent-dark dark:hover:bg-gray-700"
        onClick={onClose}
      >
        <FormattedMessage
          id="general.hide_details"
          defaultMessage="Hide details"
        />
        <ChevronUpIcon className="size-4" />
      </button>
    </div>
  );
}
