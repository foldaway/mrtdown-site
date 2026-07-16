import { LinkIcon } from '@heroicons/react/16/solid';
import type { Evidence, EvidenceRender } from '@mrtdown/core';
import { FormattedDate, FormattedMessage, useIntl } from 'react-intl';
import { Source } from './Source';

export type TimelineItemUpdate = {
  type: Evidence['type'];
  text: Evidence['text'];
  sourceUrl: Evidence['sourceUrl'];
  createdAt: Evidence['ts'];
  textTranslations: EvidenceRender['text'] | null;
};

interface Props {
  update: TimelineItemUpdate;
}

export const TimelineItem: React.FC<Props> = (props) => {
  const { update } = props;
  const intl = useIntl();
  const localizedText = getLocalizedText(update, intl.locale);

  return (
    <div className="relative flex items-start gap-3 pb-5 last:pb-0 sm:pb-6">
      <div className="relative flex size-5 items-center justify-center rounded-full bg-blue-500 dark:bg-blue-400">
        <div className="h-2 w-2 rounded-full bg-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <time className="font-medium text-gray-500 text-xs dark:text-gray-400">
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
          {localizedText.trim().length > 0 ? (
            <p className="text-gray-800 text-sm leading-5 dark:text-gray-200">
              {localizedText}
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

function getLocalizedText(update: TimelineItemUpdate, locale: string) {
  if (update.textTranslations == null) {
    return update.text;
  }

  if (!(locale in update.textTranslations)) {
    return update.text;
  }

  return (
    update.textTranslations[locale as keyof EvidenceRender['text']] ??
    update.text
  );
}
