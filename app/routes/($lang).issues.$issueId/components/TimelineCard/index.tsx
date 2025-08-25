import { LinkIcon } from '@heroicons/react/20/solid';
import { useState } from 'react';
import type { IssueUpdate } from '~/client';

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
      <h2 className="font-medium text-gray-900 text-lg dark:text-gray-100">
        Timeline
      </h2>
      <div className="relative mt-6">
        {displayedUpdates.length > 1 && (
          <div
            className="absolute top-2.5 left-2.5 w-px bg-gray-300 dark:bg-gray-600"
            style={{ bottom: '2rem' }}
          />
        )}
        {displayedUpdates.map((update, index) => (
          <div
            key={index}
            className="relative flex items-start space-x-4 pb-8 last:pb-0"
          >
            <div className="relative z-10 flex size-5 items-center justify-center rounded-full bg-blue-500 dark:bg-blue-400">
              <div className="h-2 w-2 rounded-full bg-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2">
                <time className="text-gray-500 text-sm dark:text-gray-400">
                  {new Date(update.createdAt).toLocaleString()}
                </time>
                {update.sourceUrl && (
                  <a
                    href={update.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <LinkIcon className="size-3" />
                  </a>
                )}
              </div>
              <div className="mt-2">
                <p className="text-gray-800 text-sm dark:text-gray-200">
                  {update.text}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {shouldShowExpandButton && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <span>
              {isExpanded
                ? 'Show less'
                : `Show ${updates.length - INITIAL_DISPLAY_COUNT} more update${updates.length - INITIAL_DISPLAY_COUNT === 1 ? '' : 's'}`}
            </span>
            <svg
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};
