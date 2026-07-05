import {
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  PlayCircleIcon,
  QueueListIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import classNames from 'classnames';
import { lazy, Suspense, useMemo, useState } from 'react';
import { defineMessage, FormattedMessage } from 'react-intl';
import { LineBar } from '~/components/LineBar';
import type {
  AdvisorySummary,
  AdvisorySummaryBucket,
  AdvisorySummaryBucketId,
  Issue,
} from '~/types';

const CurrentAdvisoriesBucketDetails = lazy(() =>
  import('./CurrentAdvisoriesSection/Details').then((module) => ({
    default: module.CurrentAdvisoriesBucketDetails,
  })),
);

const BUCKET_CONFIG = {
  now: {
    label: defineMessage({
      id: 'home.advisories.bucket_now',
      defaultMessage: 'Happening Now',
    }),
    countLabel: defineMessage({
      id: 'home.advisories.bucket_now_count',
      defaultMessage:
        '{count, plural, one {{count} advisory} other {{count} advisories}}',
    }),
    Icon: PlayCircleIcon,
  },
  later_today: {
    label: defineMessage({
      id: 'home.advisories.bucket_later_today',
      defaultMessage: 'Later Today',
    }),
    countLabel: defineMessage({
      id: 'home.advisories.bucket_later_today_count',
      defaultMessage:
        '{count, plural, one {{count} advisory} other {{count} advisories}}',
    }),
    Icon: ClockIcon,
  },
  this_week: {
    label: defineMessage({
      id: 'home.advisories.bucket_this_week',
      defaultMessage: 'This Week',
    }),
    countLabel: defineMessage({
      id: 'home.advisories.bucket_this_week_count',
      defaultMessage:
        '{count, plural, one {{count} advisory} other {{count} advisories}}',
    }),
    Icon: CalendarDaysIcon,
  },
  background: {
    label: defineMessage({
      id: 'home.advisories.bucket_background',
      defaultMessage: 'Ongoing Background Works',
    }),
    countLabel: defineMessage({
      id: 'home.advisories.bucket_background_count',
      defaultMessage:
        '{count, plural, one {{count} work} other {{count} works}}',
    }),
    Icon: QueueListIcon,
  },
} satisfies Record<
  AdvisorySummaryBucketId,
  {
    label: ReturnType<typeof defineMessage>;
    countLabel: ReturnType<typeof defineMessage>;
    Icon: React.ComponentType<{ className?: string }>;
  }
>;

interface Props {
  advisorySummary: AdvisorySummary;
  issuesById: Record<string, Issue>;
  lineOperationalCount: number;
}

export const CurrentAdvisoriesSection: React.FC<Props> = (props) => {
  const { advisorySummary, issuesById, lineOperationalCount } = props;
  const [detailsOpen, setDetailsOpen] = useState(false);

  const visibleBuckets = useMemo(() => {
    return advisorySummary.buckets.filter((bucket) => bucket.count > 0);
  }, [advisorySummary.buckets]);
  const advisoryCount = visibleBuckets.reduce(
    (count, bucket) => count + bucket.count,
    0,
  );
  const compactGridBuckets = visibleBuckets.filter(
    (bucket) => bucket.id !== 'now',
  );
  const compactGridFullWidthBucketId =
    compactGridBuckets.length % 2 === 1
      ? compactGridBuckets.at(-1)?.id
      : undefined;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm md:px-6 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-1.5">
          <h2 className="font-bold text-gray-900 text-lg sm:text-xl dark:text-gray-100">
            <FormattedMessage
              id="site.landing.service_advisories"
              defaultMessage="Service Advisories"
            />
          </h2>
          {advisoryCount > 0 && (
            <button
              type="button"
              aria-expanded={detailsOpen}
              aria-controls="current-advisories-details"
              className="shrink-0 rounded-lg bg-accent-light px-3 py-1.5 font-medium text-sm text-white transition-all duration-200 hover:bg-accent-light/80 hover:shadow-md dark:bg-accent-dark dark:hover:bg-accent-dark/80"
              onClick={() => setDetailsOpen((isOpen) => !isOpen)}
            >
              <div className="flex items-center justify-center gap-x-2 sm:justify-between">
                {detailsOpen ? (
                  <>
                    <FormattedMessage
                      id="general.hide_details"
                      defaultMessage="Hide details"
                    />
                    <ChevronUpIcon className="size-4" />
                  </>
                ) : (
                  <>
                    <FormattedMessage
                      id="general.show_details"
                      defaultMessage="Show details"
                    />
                    <ChevronDownIcon className="size-4" />
                  </>
                )}
              </div>
            </button>
          )}
        </div>
        <div
          id="current-advisories-details"
          className={classNames(
            'grid grid-cols-1 gap-1.5 text-gray-800 dark:text-gray-200',
            {
              'sm:grid-cols-2': !detailsOpen,
            },
          )}
        >
          {visibleBuckets.length > 0 ? (
            visibleBuckets.map((bucket) => (
              <AdvisoryBucketSection
                key={bucket.id}
                advisorySummary={advisorySummary}
                bucket={bucket}
                detailsOpen={detailsOpen}
                issuesById={issuesById}
                spansCompactGrid={
                  bucket.id === 'now' ||
                  bucket.id === compactGridFullWidthBucketId
                }
              />
            ))
          ) : (
            <div className="flex min-w-0 flex-col items-start gap-1.5 rounded-lg bg-gray-50 p-2 text-xs sm:text-sm min-[360px]:flex-row min-[360px]:items-center min-[360px]:gap-x-2 dark:bg-gray-700/50">
              <div className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-operational-light/20 text-operational-light shadow-sm ring-1 ring-operational-light/40 sm:size-7 dark:bg-operational-dark/30 dark:text-operational-dark dark:ring-operational-dark/60">
                <CheckCircleIcon className="size-3.5 sm:size-5" />
              </div>
              <div className="flex min-w-0 items-center whitespace-pre-wrap leading-tight">
                <FormattedMessage
                  id="home.advisories.none_actionable"
                  defaultMessage="No advisories needing attention"
                />
              </div>
            </div>
          )}
        </div>
        {lineOperationalCount > 0 && (
          <div className="flex items-center justify-center gap-1 border-gray-200 border-t pt-1.5 text-gray-500 text-xs dark:border-gray-700 dark:text-gray-400">
            <CheckCircleIcon className="size-4 shrink-0 text-operational-light dark:text-operational-dark" />
            <FormattedMessage
              id="general.count_line_operational"
              defaultMessage="<bold>{count}</bold> {count, plural, one {Line} other {Lines}} Operational"
              values={{
                count: lineOperationalCount,
                bold: (chunks) => (
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {chunks}
                  </span>
                ),
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

function AdvisoryBucketSection(props: {
  advisorySummary: AdvisorySummary;
  bucket: AdvisorySummaryBucket;
  detailsOpen: boolean;
  issuesById: Record<string, Issue>;
  spansCompactGrid: boolean;
}) {
  const { advisorySummary, bucket, detailsOpen, issuesById, spansCompactGrid } =
    props;
  const hasDisruption = bucket.issueIds.some(
    (issueId) => issuesById[issueId]?.type === 'disruption',
  );

  return (
    <section
      className={classNames(
        'flex min-w-0 flex-col gap-2 rounded-xl border bg-gray-50 p-1.5 dark:bg-gray-700/40',
        {
          'sm:col-span-2': !detailsOpen && spansCompactGrid,
          'border-red-300/70 dark:border-red-500/50':
            bucket.id === 'now' && hasDisruption,
          'border-gray-200 dark:border-gray-700':
            bucket.id !== 'now' || !hasDisruption,
        },
      )}
    >
      <AdvisoryBucketCard bucket={bucket} issuesById={issuesById} />
      {detailsOpen && (
        <div className="border-gray-200 border-t pt-2 dark:border-gray-600">
          <Suspense
            fallback={
              <CurrentAdvisoriesDetailsSkeleton issueIds={bucket.issueIds} />
            }
          >
            <CurrentAdvisoriesBucketDetails
              advisorySummary={advisorySummary}
              bucketId={bucket.id}
              issueIds={bucket.issueIds}
              issuesById={issuesById}
            />
          </Suspense>
        </div>
      )}
    </section>
  );
}

function AdvisoryBucketCard(props: {
  bucket: AdvisorySummaryBucket;
  issuesById: Record<string, Issue>;
}) {
  const { bucket, issuesById } = props;
  const config = BUCKET_CONFIG[bucket.id];
  const lineIds = [
    ...new Set(
      bucket.issueIds.flatMap((issueId) => issuesById[issueId]?.lineIds ?? []),
    ),
  ].sort();
  const hasDisruption = bucket.issueIds.some(
    (issueId) => issuesById[issueId]?.type === 'disruption',
  );
  const { Icon } = config;

  return (
    <div className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5 pb-0.5 text-sm">
      <div
        className={classNames(
          'inline-flex size-5 shrink-0 items-center justify-center rounded-full ring-1',
          {
            'bg-red-50 text-red-600 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-700/60':
              bucket.id === 'now' && hasDisruption,
            'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-700/60':
              bucket.id === 'now' && !hasDisruption,
            'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-700/60':
              bucket.id === 'later_today',
            'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-700/60':
              bucket.id === 'this_week',
            'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600':
              bucket.id === 'background',
          },
        )}
      >
        <Icon className="size-3" />
      </div>
      <div className="min-w-0 truncate font-semibold text-gray-900 leading-tight dark:text-gray-100">
        <FormattedMessage {...config.label} />
      </div>
      <div className="shrink-0 rounded-md bg-white px-1.5 py-0.5 font-medium text-gray-600 text-xs leading-5 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600">
        <FormattedMessage
          {...config.countLabel}
          values={{ count: bucket.count }}
        />
      </div>
      {lineIds.length > 0 && (
        <div className="col-start-2 col-end-4 min-w-0">
          <LineBar lineIds={lineIds} />
        </div>
      )}
    </div>
  );
}

function CurrentAdvisoriesDetailsSkeleton(props: { issueIds: string[] }) {
  return (
    <div className="flex flex-col space-y-2">
      {props.issueIds.map((issueId) => (
        <CurrentAdvisoriesDetailsSkeletonCard key={issueId} />
      ))}
    </div>
  );
}

function CurrentAdvisoriesDetailsSkeletonCard() {
  return (
    <div className="flex flex-col rounded-xl border border-gray-300 bg-white px-4 py-3 shadow-sm sm:px-6 sm:py-4 dark:border-gray-600 dark:bg-gray-800">
      <div className="h-5 w-44 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-3 h-4 w-full max-w-xl rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-2 h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}
