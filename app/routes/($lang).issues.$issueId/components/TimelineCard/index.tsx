import { LinkIcon } from '@heroicons/react/20/solid';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { FormattedDate, FormattedMessage } from 'react-intl';
import type { IssueUpdate } from '~/client';
import { TimelineItem } from './components/TimelineItem';

interface Props {
  updates: IssueUpdate[];
}

const INITIAL_DISPLAY_COUNT = 3;

export const TimelineCard: React.FC<Props> = (props) => {
  const { updates } = props;
  const [isExpanded, setIsExpanded] = useState(false);

  const shouldShowExpandButton = updates.length > INITIAL_DISPLAY_COUNT;
  const displayedUpdates = isExpanded
    ? updates
    : updates.slice(0, INITIAL_DISPLAY_COUNT);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">
        Timeline
      </h2>
      <div className="relative mt-6">
        {displayedUpdates.length > 1 && (
          <div
            className="absolute top-2.5 left-2.5 w-px bg-gray-300 dark:bg-gray-600"
            style={{ bottom: '2rem' }}
          />
        )}
        {displayedUpdates.map((update) => (
          <TimelineItem key={update.sourceUrl} update={update} />
        ))}
      </div>
      {shouldShowExpandButton && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <span>
              {isExpanded ? (
                <FormattedMessage
                  id="general.show_less"
                  defaultMessage="Show less"
                />
              ) : (
                <FormattedMessage
                  id="general.show_more_with_count"
                  defaultMessage="Show {count, number} more"
                  values={{
                    count: updates.length - INITIAL_DISPLAY_COUNT,
                  }}
                />
              )}
            </span>
            {isExpanded ? (
              <ChevronUpIcon className="size-4" />
            ) : (
              <ChevronDownIcon className="size-4" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};
