import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import type { IngestContentCrowdReportEffect } from '@mrtdown/ingest-contracts';
import {
  defineMessages,
  FormattedDate,
  FormattedMessage,
  type MessageDescriptor,
  useIntl,
} from 'react-intl';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { PublicCrowdReportSignal } from '~/util/crowdReports';
import { BetaBadge } from './BetaBadge';
import { LineBar } from './LineBar';

const EFFECT_LABEL_MESSAGES = defineMessages({
  delay: { id: 'report.effect.delay', defaultMessage: 'Delay' },
  noService: {
    id: 'report.effect.no_service',
    defaultMessage: 'No service',
  },
  crowding: { id: 'report.effect.crowding', defaultMessage: 'Crowding' },
  skippedStop: {
    id: 'report.effect.skipped_stop',
    defaultMessage: 'Train skipped stop',
  },
  unknown: { id: 'report.effect.unknown', defaultMessage: 'Not sure' },
});

const EFFECT_LABELS = {
  delay: EFFECT_LABEL_MESSAGES.delay,
  'no-service': EFFECT_LABEL_MESSAGES.noService,
  crowding: EFFECT_LABEL_MESSAGES.crowding,
  'skipped-stop': EFFECT_LABEL_MESSAGES.skippedStop,
  unknown: EFFECT_LABEL_MESSAGES.unknown,
} satisfies Record<IngestContentCrowdReportEffect, MessageDescriptor>;

interface Props {
  signals: PublicCrowdReportSignal[];
  className?: string;
}

function getEffectLabel(effect: PublicCrowdReportSignal['effect']) {
  return EFFECT_LABELS[effect ?? 'unknown'];
}

export const CommunitySignalsSection: React.FC<Props> = (props) => {
  const { signals, className } = props;
  const { stations } = useIncludedEntities();
  const intl = useIntl();

  if (signals.length === 0) {
    return null;
  }

  return (
    <section
      className={[
        'rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/70 dark:bg-amber-950/30',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/70 dark:text-amber-200">
          <ChatBubbleLeftRightIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">
              <FormattedMessage
                id="community_signals.title"
                defaultMessage="Community reports"
              />
            </h2>
            <BetaBadge />
          </div>
          <p className="mt-1 text-gray-700 text-sm leading-5 dark:text-gray-300">
            <FormattedMessage
              id="community_signals.description"
              defaultMessage="Aggregated commuter reports shown separately from official operator advisories."
            />
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {signals.map((signal) => {
          const stationNames = signal.stationIds
            .map((stationId) => stations[stationId])
            .filter((station) => station != null)
            .map((station) =>
              getLocalizedTranslation(station.name, intl.locale),
            );

          return (
            <article
              key={signal.id}
              className="rounded-lg border border-amber-200 bg-white p-3 shadow-sm dark:border-amber-900 dark:bg-gray-900/70"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-md bg-amber-100 px-2 py-1 font-medium text-amber-900 text-xs dark:bg-amber-900 dark:text-amber-100">
                  <FormattedMessage {...getEffectLabel(signal.effect)} />
                </span>
                <span className="text-gray-600 text-xs dark:text-gray-400">
                  <FormattedMessage
                    id="community_signals.report_count"
                    defaultMessage="{count, plural, one {# report} other {# reports}}"
                    values={{ count: signal.reportCount }}
                  />
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                {signal.lineIds.length > 0 && (
                  <div>
                    <LineBar lineIds={signal.lineIds} />
                  </div>
                )}
                {stationNames.length > 0 && (
                  <p className="text-gray-800 text-sm leading-5 dark:text-gray-200">
                    {stationNames.join(', ')}
                  </p>
                )}
              </div>

              <p className="mt-3 text-gray-500 text-xs dark:text-gray-400">
                <FormattedMessage
                  id="community_signals.updated_at"
                  defaultMessage="Updated {updatedAt}"
                  values={{
                    updatedAt: (
                      <FormattedDate
                        value={signal.updatedAt}
                        hour="numeric"
                        minute="2-digit"
                      />
                    ),
                  }}
                />
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
};
