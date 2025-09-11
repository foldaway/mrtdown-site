import { LinkIcon } from '@heroicons/react/16/solid';
import { FormattedDate, FormattedMessage } from 'react-intl';
import type { IssueUpdate } from '~/client';
import { Source } from './Source';

interface Props {
  update: IssueUpdate;
}

export const TimelineItem: React.FC<Props> = (props) => {
  const { update } = props;

  return (
    <div className="relative flex items-start space-x-4 pb-8 last:pb-0">
      <div className="relative flex size-5 items-center justify-center rounded-full bg-blue-500 dark:bg-blue-400">
        <div className="h-2 w-2 rounded-full bg-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center space-x-2">
          <time className="text-gray-500 text-sm dark:text-gray-400">
            <FormattedDate
              value={update.createdAt}
              dateStyle="medium"
              timeStyle="short"
            />
          </time>
          {update.sourceUrl && (
            <>
              <Source sourceUrl={update.sourceUrl} />
              <a
                href={update.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <LinkIcon className="size-3" />
              </a>
            </>
          )}
        </div>
        <div className="mt-2">
          {update.text.trim().length > 0 ? (
            <p className="text-gray-800 text-sm dark:text-gray-200">
              {update.text}
            </p>
          ) : (
            <p className="text-gray-500 text-sm italic dark:text-gray-400">
              <FormattedMessage
                id="issue.no_update_text"
                defaultMessage="No update text provided."
              />
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
