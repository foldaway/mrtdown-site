import type { IngestContentCrowdReportEffect } from '@mrtdown/ingest-contracts';
import { Link } from '@tanstack/react-router';
import {
  defineMessages,
  FormattedMessage,
  type MessageDescriptor,
  useIntl,
} from 'react-intl';
import { BetaBadge } from '~/components/BetaBadge';
import { useIncludedEntities } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import type { PublicCrowdReportSignal } from '~/util/crowdReports';

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

type HomeCommunityReportsStripProps = {
  signals: PublicCrowdReportSignal[];
};

function getEffectLabel(effect: PublicCrowdReportSignal['effect']) {
  return EFFECT_LABELS[effect ?? 'unknown'];
}

export function HomeCommunityReportsStrip(
  props: HomeCommunityReportsStripProps,
) {
  const { signals } = props;
  const { stations } = useIncludedEntities();
  const intl = useIntl();
  const lineIds = [
    ...new Set(signals.flatMap((signal) => signal.lineIds)),
  ].sort((a, b) => a.localeCompare(b));
  const reportCount = signals.reduce(
    (count, signal) => count + signal.reportCount,
    0,
  );
  const hasCommunityReports = signals.length > 0;
  const communityReportsTitle =
    lineIds.length > 0 ? (
      <FormattedMessage
        id="home.community_reports_active_on_lines"
        defaultMessage="Some reports on {lines}"
        values={{ lines: lineIds.join(', ') }}
      />
    ) : (
      <FormattedMessage
        id="home.community_reports_active"
        defaultMessage="Some community reports"
      />
    );

  return (
    <section
      className={[
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 sm:flex sm:justify-between sm:gap-4 sm:rounded-2xl sm:p-4',
        hasCommunityReports
          ? 'border-amber-200 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950/30'
          : 'border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30',
      ].join(' ')}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="font-semibold text-gray-900 text-sm leading-5 sm:text-base dark:text-gray-100">
            {hasCommunityReports ? (
              signals.length === 1 ? (
                <Link
                  to="/{-$lang}/community-reports/$kind/$sourceId"
                  params={{ kind: 'cluster', sourceId: signals[0].id }}
                  className="inline-flex items-center gap-1 hover:text-amber-800 hover:underline dark:hover:text-amber-200"
                >
                  {communityReportsTitle}
                  <span aria-hidden="true">→</span>
                </Link>
              ) : (
                communityReportsTitle
              )
            ) : (
              <FormattedMessage
                id="home.report_cta_title"
                defaultMessage="Seeing a train delay?"
              />
            )}
          </h2>
          <BetaBadge />
        </div>
        <p className="mt-1 text-gray-600 text-xs leading-4 sm:text-sm sm:leading-5 dark:text-gray-300">
          {hasCommunityReports ? (
            <FormattedMessage
              id="home.community_reports_active_body"
              defaultMessage="{count, plural, one {# recent commuter report} other {# recent commuter reports}}. Community reports are unverified and do not change the service status above."
              values={{ count: reportCount }}
            />
          ) : (
            <FormattedMessage
              id="home.report_cta_body"
              defaultMessage="Share a community report for review. It stays separate from official service status."
            />
          )}
        </p>
        {signals.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {signals.map((signal) => {
              const signalLines = signal.lineIds.join(', ');
              const signalStations = signal.stationIds
                .map((stationId) => stations[stationId])
                .filter((station) => station != null)
                .map((station) =>
                  getLocalizedTranslation(station.name, intl.locale),
                )
                .join(', ');
              const signalScope = [signalLines, signalStations]
                .filter(Boolean)
                .join(' · ');
              const signalEffect = intl.formatMessage(
                getEffectLabel(signal.effect),
              );
              return (
                <Link
                  key={signal.id}
                  to="/{-$lang}/community-reports/$kind/$sourceId"
                  params={{ kind: 'cluster', sourceId: signal.id }}
                  className="inline-flex items-center rounded-md border border-amber-200 bg-white/70 px-2 py-1 font-medium text-amber-900 text-xs hover:border-amber-400 hover:bg-white dark:border-amber-800 dark:bg-gray-900/50 dark:text-amber-100 dark:hover:border-amber-600 dark:hover:bg-gray-900"
                >
                  {signalScope.length > 0 ? (
                    <FormattedMessage
                      id="home.community_report_details_link"
                      defaultMessage="{effect} · {scope}: {count, plural, one {# report} other {# reports}} →"
                      values={{
                        count: signal.reportCount,
                        effect: signalEffect,
                        scope: signalScope,
                      }}
                    />
                  ) : (
                    <FormattedMessage
                      id="home.community_report_details_link_general"
                      defaultMessage="{effect}: {count, plural, one {# report} other {# reports}} →"
                      values={{
                        count: signal.reportCount,
                        effect: signalEffect,
                      }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <Link
        to="/{-$lang}/report"
        className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-accent-light px-3 py-1.5 font-semibold text-sm text-white transition-colors hover:bg-accent-dark sm:min-h-10 sm:px-4 sm:py-2"
      >
        <FormattedMessage id="home.report_cta" defaultMessage="Submit report" />
      </Link>
    </section>
  );
}
