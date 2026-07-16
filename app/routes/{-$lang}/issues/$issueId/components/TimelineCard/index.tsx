import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { TimelineItem } from './components/TimelineItem';

interface Props {
  updates: React.ComponentProps<typeof TimelineItem>['update'][];
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
    <section
      aria-labelledby="issue-timeline-heading"
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
        <h2
          id="issue-timeline-heading"
          className="font-bold text-base text-gray-900 leading-tight dark:text-gray-100"
        >
          <FormattedMessage
            id="issue.details.timeline"
            defaultMessage="Service updates"
          />
        </h2>
        <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-[11px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          <FormattedMessage
            id="issue.details.update_count"
            defaultMessage="{count, plural, one {{count} update} other {{count} updates}}"
            values={{ count: updates.length }}
          />
        </span>
      </div>
      <div className="border-gray-200 border-t px-4 py-4 sm:px-6 sm:py-5 dark:border-gray-700">
        <div className="relative">
          {displayedUpdates.length > 1 && (
            <div
              className="absolute top-2.5 left-2.5 w-px bg-blue-200 dark:bg-blue-800"
              style={{ bottom: '1.5rem' }}
            />
          )}
          {displayedUpdates.map((update) => (
            <TimelineItem key={update.sourceUrl} update={update} />
          ))}
        </div>
        {shouldShowExpandButton && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-700 text-xs transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
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
    </section>
  );
};
