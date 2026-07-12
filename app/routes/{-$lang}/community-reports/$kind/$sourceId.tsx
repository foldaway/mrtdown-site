import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  MapIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import type { IngestContentCrowdReportEffect } from '@mrtdown/ingest-contracts';
import { createFileRoute } from '@tanstack/react-router';
import classNames from 'classnames';
import {
  createIntl,
  defineMessages,
  FormattedDate,
  FormattedList,
  FormattedMessage,
  type MessageDescriptor,
  useIntl,
} from 'react-intl';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildSeoMetadata } from '~/helpers/seo';
import { assert } from '~/util/assert';
import {
  getCrowdReportSourceFn,
  type CrowdReportSource,
} from '~/util/crowdReportSource.functions';

type CrowdReportSourceKind = 'cluster' | 'report';

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

export const Route = createFileRoute(
  '/{-$lang}/community-reports/$kind/$sourceId',
)({
  component: CommunityReportSourcePage,
  loader: ({ params }) => {
    if (!isCrowdReportSourceKind(params.kind)) {
      throw new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
      });
    }

    return getCrowdReportSourceFn({
      data: {
        kind: params.kind,
        sourceId: params.sourceId,
      },
    });
  },
  async head(ctx) {
    const { kind, sourceId, lang = 'en-SG' } = ctx.params;
    assert(ctx.loaderData != null);
    const source = ctx.loaderData;
    const { default: messages } = await import(
      `../../../../../lang/${lang}.json`
    );
    const intl = createIntl({ locale: lang, messages });
    const rootUrl = import.meta.env.VITE_ROOT_URL;
    assert(rootUrl != null, 'VITE_ROOT_URL is not set');

    const title = intl.formatMessage({
      id: 'community_report_source.page_title',
      defaultMessage: 'Community report evidence',
    });
    const description = intl.formatMessage(
      {
        id: 'community_report_source.page_description',
        defaultMessage:
          '{count, plural, one {A community report} other {# community reports}} about MRT or LRT service conditions.',
      },
      { count: source.reportCount },
    );
    const seo = buildSeoMetadata({
      lang,
      path: `/community-reports/${encodeURIComponent(kind)}/${encodeURIComponent(
        sourceId,
      )}`,
      rootUrl,
    });

    return {
      links: seo.links,
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: seo.ogUrl },
      ],
    };
  },
});

function getEffectLabel(effect: CrowdReportSource['effect']) {
  return EFFECT_LABELS[effect ?? 'unknown'];
}

function isCrowdReportSourceKind(
  value: string,
): value is CrowdReportSourceKind {
  return value === 'cluster' || value === 'report';
}

function SourceStatusBadge(props: { status: CrowdReportSource['status'] }) {
  const { status } = props;
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-xs',
        {
          'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100':
            status === 'dispatched',
          'bg-amber-100 text-amber-900 dark:bg-amber-900/70 dark:text-amber-100':
            status === 'accepted',
        },
      )}
    >
      {status === 'dispatched' ? (
        <CheckCircleIcon className="size-3.5" />
      ) : (
        <ClockIcon className="size-3.5" />
      )}
      {status === 'dispatched' ? (
        <FormattedMessage
          id="community_report_source.status_dispatched"
          defaultMessage="Dispatched"
        />
      ) : (
        <FormattedMessage
          id="community_report_source.status_accepted"
          defaultMessage="Accepted"
        />
      )}
    </span>
  );
}

function FactCard(props: {
  label: MessageDescriptor;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <dt className="font-medium text-gray-500 text-xs uppercase tracking-wide dark:text-gray-400">
        <FormattedMessage {...props.label} />
      </dt>
      <dd className="mt-2 font-semibold text-gray-900 text-sm dark:text-gray-100">
        {props.children}
      </dd>
    </div>
  );
}

function CommunityReportSourcePage() {
  const source = Route.useLoaderData();
  const intl = useIntl();
  const observedSameTime = source.observedStartAt === source.observedEndAt;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 sm:p-6 dark:border-amber-900/70 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/70 dark:text-amber-200">
            <ChatBubbleLeftRightIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <SourceStatusBadge status={source.status} />
              <span className="rounded-md bg-white px-2.5 py-1 font-medium text-amber-900 text-xs dark:bg-gray-900/80 dark:text-amber-100">
                {source.kind === 'cluster' ? (
                  <FormattedMessage
                    id="community_report_source.kind_cluster"
                    defaultMessage="Report cluster"
                  />
                ) : (
                  <FormattedMessage
                    id="community_report_source.kind_report"
                    defaultMessage="Single report"
                  />
                )}
              </span>
            </div>
            <h1 className="mt-3 font-bold text-2xl text-gray-900 dark:text-gray-100">
              <FormattedMessage
                id="community_report_source.title"
                defaultMessage="Community report evidence"
              />
            </h1>
            <p className="mt-2 max-w-2xl text-gray-700 text-sm leading-6 dark:text-gray-300">
              <FormattedMessage
                id="community_report_source.description"
                defaultMessage="Structured commuter reports shown separately from official operator advisories."
              />
            </p>
          </div>
        </div>
      </section>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FactCard
          label={{
            id: 'community_report_source.effect',
            defaultMessage: 'Effect',
          }}
        >
          <FormattedMessage {...getEffectLabel(source.effect)} />
        </FactCard>
        <FactCard
          label={{
            id: 'community_report_source.report_count',
            defaultMessage: 'Reports',
          }}
        >
          <FormattedMessage
            id="community_report_source.report_count_value"
            defaultMessage="{count, plural, one {# report} other {# reports}}"
            values={{ count: source.reportCount }}
          />
        </FactCard>
        <FactCard
          label={{
            id: 'community_report_source.observed',
            defaultMessage: 'Observed',
          }}
        >
          {observedSameTime ? (
            <FormattedDate
              value={source.observedStartAt}
              dateStyle="medium"
              timeStyle="short"
            />
          ) : (
            <FormattedMessage
              id="community_report_source.observed_range"
              defaultMessage="{start} to {end}"
              values={{
                start: (
                  <FormattedDate
                    value={source.observedStartAt}
                    dateStyle="medium"
                    timeStyle="short"
                  />
                ),
                end: (
                  <FormattedDate
                    value={source.observedEndAt}
                    dateStyle="medium"
                    timeStyle="short"
                  />
                ),
              }}
            />
          )}
        </FactCard>
        <FactCard
          label={
            source.dispatchedAt == null
              ? {
                  id: 'community_report_source.updated',
                  defaultMessage: 'Updated',
                }
              : {
                  id: 'community_report_source.dispatched_at',
                  defaultMessage: 'Dispatched',
                }
          }
        >
          <FormattedDate
            value={source.dispatchedAt ?? source.updatedAt}
            dateStyle="medium"
            timeStyle="short"
          />
        </FactCard>
      </dl>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <MapIcon className="size-5 text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">
              <FormattedMessage
                id="community_report_source.lines"
                defaultMessage="Affected lines"
              />
            </h2>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {source.lines.length > 0 ? (
              source.lines.map((line) => (
                <span
                  key={line.id}
                  className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 font-medium text-gray-900 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: line.color }}
                  />
                  {getLocalizedTranslation(line.name, intl.locale)}
                </span>
              ))
            ) : (
              <p className="text-gray-500 text-sm dark:text-gray-400">
                <FormattedMessage
                  id="community_report_source.no_lines"
                  defaultMessage="No specific line was reported."
                />
              </p>
            )}
          </div>
        </article>

        <article className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <MapPinIcon className="size-5 text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">
              <FormattedMessage
                id="community_report_source.stations"
                defaultMessage="Affected stations"
              />
            </h2>
          </div>
          {source.stations.length > 0 ? (
            <p className="mt-3 text-gray-800 text-sm leading-6 dark:text-gray-200">
              <FormattedList
                type="unit"
                value={source.stations.map((station) =>
                  getLocalizedTranslation(station.name, intl.locale),
                )}
              />
            </p>
          ) : (
            <p className="mt-3 text-gray-500 text-sm dark:text-gray-400">
              <FormattedMessage
                id="community_report_source.no_stations"
                defaultMessage="No specific station was reported."
              />
            </p>
          )}
        </article>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="size-5 text-gray-500 dark:text-gray-400" />
          <h2 className="font-semibold text-base text-gray-900 dark:text-gray-100">
            <FormattedMessage
              id="community_report_source.details"
              defaultMessage="Reported details"
            />
          </h2>
        </div>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="font-medium text-gray-500 text-xs uppercase tracking-wide dark:text-gray-400">
              <FormattedMessage
                id="community_report_source.direction"
                defaultMessage="Direction"
              />
            </dt>
            <dd className="mt-1 text-gray-900 text-sm dark:text-gray-100">
              {source.directionText ?? (
                <FormattedMessage
                  id="community_report_source.not_provided"
                  defaultMessage="Not provided"
                />
              )}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500 text-xs uppercase tracking-wide dark:text-gray-400">
              <FormattedMessage
                id="community_report_source.delay"
                defaultMessage="Delay"
              />
            </dt>
            <dd className="mt-1 text-gray-900 text-sm dark:text-gray-100">
              {source.delayMinutes == null ? (
                <FormattedMessage
                  id="community_report_source.not_provided"
                  defaultMessage="Not provided"
                />
              ) : (
                <FormattedMessage
                  id="community_report_source.delay_minutes"
                  defaultMessage="{minutes} min"
                  values={{ minutes: source.delayMinutes }}
                />
              )}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500 text-xs uppercase tracking-wide dark:text-gray-400">
              <FormattedMessage
                id="community_report_source.still_happening"
                defaultMessage="Still happening"
              />
            </dt>
            <dd className="mt-1 text-gray-900 text-sm dark:text-gray-100">
              {source.stillHappening == null ? (
                <FormattedMessage
                  id="community_report_source.not_provided"
                  defaultMessage="Not provided"
                />
              ) : source.stillHappening ? (
                <FormattedMessage
                  id="community_report_source.yes"
                  defaultMessage="Yes"
                />
              ) : (
                <FormattedMessage
                  id="community_report_source.no"
                  defaultMessage="No"
                />
              )}
            </dd>
          </div>
        </dl>
      </section>

      <p className="text-gray-500 text-xs leading-5 dark:text-gray-400">
        <FormattedMessage
          id="community_report_source.privacy_note"
          defaultMessage="This permalink includes structured public report fields only. Reporter metadata and abuse-control data are not published."
        />
      </p>
    </div>
  );
}
