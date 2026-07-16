import {
  BuildingOfficeIcon,
  Cog8ToothIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/16/solid';
import { createFileRoute } from '@tanstack/react-router';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import {
  createIntl,
  FormattedMessage,
  type IntlShape,
  useIntl,
} from 'react-intl';
import { IssueTypeLabels } from '~/constants';
import { IncludedEntitiesContext } from '~/contexts/IncludedEntities';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { buildSeoMetadata } from '~/helpers/seo';
import { IssueStatusBadge } from '~/components/IssueStatusBadge';
import type { IssueInterval } from '~/types';
import { assert } from '~/util/assert';
import { getIssueFn } from '~/util/issue.functions';
import { Attributes } from './components/Attributes';
import { StatsCard } from './components/StatsCard';
import { TimelineCard } from './components/TimelineCard';

const SG_TIMEZONE = 'Asia/Singapore';

function formatIssueDescriptionPeriod(
  intervals: IssueInterval[],
  intl: IntlShape,
) {
  if (intervals.length === 0) {
    return intl.formatMessage({
      id: 'issue.period_unknown',
      defaultMessage: 'an unknown date',
    });
  }

  const sortedIntervals = [...intervals].sort((a, b) => {
    return (
      DateTime.fromISO(a.startAt).toMillis() -
      DateTime.fromISO(b.startAt).toMillis()
    );
  });
  const firstInterval = sortedIntervals[0];
  const lastInterval = sortedIntervals.at(-1);
  assert(firstInterval != null);
  assert(lastInterval != null);

  const start = DateTime.fromISO(firstInterval.startAt).setZone(SG_TIMEZONE);
  const end =
    lastInterval.endAt == null
      ? null
      : DateTime.fromISO(lastInterval.endAt).setZone(SG_TIMEZONE);
  const startDate = intl.formatDate(start.toJSDate(), {
    day: 'numeric',
    month: 'long',
    timeZone: SG_TIMEZONE,
    year: 'numeric',
  });

  if (end == null) {
    return intl.formatMessage(
      {
        id: 'issue.period_since',
        defaultMessage: 'since {startDate}',
      },
      { startDate },
    );
  }

  if (start.hasSame(end, 'day')) {
    return startDate;
  }

  return intl.formatMessage(
    {
      id: 'issue.period_range',
      defaultMessage: '{startDate} to {endDate}',
    },
    {
      startDate,
      endDate: intl.formatDate(end.toJSDate(), {
        day: 'numeric',
        month: 'long',
        timeZone: SG_TIMEZONE,
        year: 'numeric',
      }),
    },
  );
}

export const Route = createFileRoute('/{-$lang}/issues/$issueId/')({
  component: IssuePage,
  loader: ({ params }) =>
    getIssueFn({
      data: { issueId: params.issueId },
    }),
  async head(ctx) {
    const { issueId, lang = 'en-SG' } = ctx.params;
    assert(ctx.loaderData != null);
    const { data, included } = ctx.loaderData;
    const issue = included.issues[data.id];
    const title = getLocalizedTranslation(issue.title, lang);

    const rootUrl = import.meta.env.VITE_ROOT_URL;
    const seo = buildSeoMetadata({
      lang,
      path: `/issues/${issueId}`,
      rootUrl,
    });

    const { default: messages } = await import(
      `../../../../../lang/${lang}.json`
    );

    const intl = createIntl({
      locale: lang,
      messages,
    });

    const stationIds = new Set<string>();
    for (const branch of issue.branchesAffected) {
      for (const stationId of branch.stationIds) {
        stationIds.add(stationId);
      }
    }
    const stationCount = stationIds.size;
    const lineNames = issue.lineIds.map((lineId) => {
      const line = included.lines[lineId];
      return getLocalizedTranslation(line.name, lang);
    });

    const description = intl.formatMessage(
      {
        id: 'issue.description',
        defaultMessage:
          'This issue affected {stationCount, plural, one { {stationCount} {lineNames} station } other { {stationCount} {lineNames} stations }} on {period}.',
      },
      {
        stationCount,
        lineNames: intl.formatList(lineNames),
        period: formatIssueDescriptionPeriod(issue.intervals, intl),
      },
    );

    return {
      links: seo.links,
      meta: [
        {
          title,
        },
        {
          name: 'description',
          content: description,
        },
        {
          property: 'og:title',
          content: title,
        },
        {
          property: 'og:description',
          content: description,
        },
        {
          property: 'og:type',
          content: 'website',
        },
        {
          property: 'og:url',
          content: seo.ogUrl,
        },
        {
          property: 'og:image',
          content: seo.ogImage,
        },
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: title,
            mainEntity: issue.intervals.map((interval) => {
              return {
                '@type': 'Event',
                name: title,
                eventAttendanceMode:
                  'https://schema.org/OfflineEventAttendanceMode',
                startDate: interval.startAt,
                endDate: interval.endAt,
                location: 'Singapore Public Transport',
              };
            }),
            url: seo.ogUrl,
            image: seo.ogImage,
          },
        },
      ],
    };
  },
});

function IssuePage() {
  const loaderData = Route.useLoaderData();
  const { data, included } = loaderData;
  const issue = included.issues[data.id];
  const { updates } = data;

  const intl = useIntl();
  const statusInterval =
    issue.intervals.find((interval) => interval.status === 'ongoing') ??
    issue.intervals.find((interval) => interval.status === 'future') ??
    issue.intervals.at(-1);

  return (
    <IncludedEntitiesContext.Provider value={included}>
      <div className="flex flex-col gap-4 sm:gap-5">
        <header className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="font-semibold text-gray-400 text-xs uppercase tracking-wide dark:text-gray-500">
            <FormattedMessage
              id="issue.service_advisory"
              defaultMessage="Service advisory"
            />
          </p>
          <h1 className="mt-1 text-pretty font-bold text-gray-900 text-xl leading-tight sm:text-2xl dark:text-gray-100">
            {getLocalizedTranslation(issue.title, intl.locale)}
          </h1>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <div
              className={classNames(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-xs ring-1 ring-inset',
                {
                  'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800':
                    issue.type === 'disruption',
                  'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800':
                    issue.type === 'maintenance',
                  'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800':
                    issue.type === 'infra',
                },
              )}
            >
              {issue.type === 'disruption' && (
                <ExclamationTriangleIcon className="size-3.5 shrink-0" />
              )}
              {issue.type === 'maintenance' && (
                <Cog8ToothIcon className="size-3.5 shrink-0" />
              )}
              {issue.type === 'infra' && (
                <BuildingOfficeIcon className="size-3.5 shrink-0" />
              )}
              <FormattedMessage {...IssueTypeLabels[issue.type]} />
            </div>
            {statusInterval != null && (
              <IssueStatusBadge interval={statusInterval} issue={issue} />
            )}
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] lg:items-start">
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="px-4 py-2.5 sm:px-6 sm:py-3">
              <h2 className="font-bold text-base text-gray-900 leading-tight dark:text-gray-100">
                <FormattedMessage
                  id="issue.details.overview"
                  defaultMessage="Advisory details"
                />
              </h2>
            </div>
            <div className="border-gray-200 border-t bg-gray-50/60 px-4 py-4 sm:px-6 sm:py-5 dark:border-gray-700 dark:bg-gray-900/20">
              <Attributes issue={issue} />
            </div>
          </section>
          <StatsCard issue={issue} />
        </div>
        <TimelineCard updates={updates} />
      </div>
    </IncludedEntitiesContext.Provider>
  );
}
