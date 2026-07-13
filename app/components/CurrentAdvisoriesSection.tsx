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
import { collectAdvisoryLineIds } from './CurrentAdvisoriesSection/helpers';

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
  const [expandedBucketIds, setExpandedBucketIds] = useState<
    AdvisorySummaryBucketId[]
  >([]);
  const [plannedOpen, setPlannedOpen] = useState(false);

  const visibleBuckets = useMemo(() => {
    return advisorySummary.buckets.filter((bucket) => bucket.count > 0);
  }, [advisorySummary.buckets]);
  const currentBucket = visibleBuckets.find((bucket) => bucket.id === 'now');
  const plannedBuckets = visibleBuckets.filter((bucket) => bucket.id !== 'now');
  const plannedAdvisoryCount = plannedBuckets.reduce(
    (count, bucket) => count + bucket.count,
    0,
  );
  const plannedLineIds = collectAdvisoryLineIds({
    buckets: plannedBuckets,
    issuesById,
  });

  function toggleBucket(bucketId: AdvisorySummaryBucketId) {
    setExpandedBucketIds((currentIds) =>
      currentIds.includes(bucketId)
        ? currentIds.filter((currentId) => currentId !== bucketId)
        : [...currentIds, bucketId],
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3 px-4 py-2.5 sm:items-center sm:px-6 sm:py-3">
        <div className="min-w-0">
          <h2 className="font-bold text-base text-gray-900 leading-tight dark:text-gray-100">
            <FormattedMessage
              id="site.landing.service_advisories"
              defaultMessage="Service Advisories"
            />
          </h2>
        </div>
        {lineOperationalCount > 0 && (
          <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-operational-light/10 px-2 py-1 font-medium text-[11px] text-operational-light ring-1 ring-operational-light/30 sm:py-0.5 dark:bg-operational-dark/15 dark:text-operational-dark dark:ring-operational-dark/40">
            <CheckCircleIcon className="size-3.5 shrink-0" />
            <span className="sm:hidden">
              {lineOperationalCount}{' '}
              <FormattedMessage
                id="status.operational"
                defaultMessage="Operational"
              />
            </span>
            <span className="hidden sm:inline">
              <FormattedMessage
                id="general.count_line_operational"
                defaultMessage="<bold>{count}</bold> {count, plural, one {Line} other {Lines}} Operational"
                values={{
                  count: lineOperationalCount,
                  bold: (chunks) => chunks,
                }}
              />
            </span>
          </div>
        )}
      </div>

      <div className="border-gray-200 border-t dark:border-gray-700">
        {visibleBuckets.length > 0 ? (
          <>
            {currentBucket && (
              <AdvisoryBucketSection
                advisorySummary={advisorySummary}
                bucket={currentBucket}
                detailsOpen={expandedBucketIds.includes(currentBucket.id)}
                emphasis="current"
                issuesById={issuesById}
                onToggle={() => toggleBucket(currentBucket.id)}
              />
            )}

            {plannedBuckets.length > 0 && (
              <>
                <button
                  type="button"
                  aria-expanded={plannedOpen}
                  aria-controls="planned-advisories"
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 px-4 py-2.5 text-left text-gray-800 text-sm transition-colors hover:bg-gray-50 sm:hidden dark:text-gray-200 dark:hover:bg-gray-700/40"
                  onClick={() => setPlannedOpen((isOpen) => !isOpen)}
                >
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600">
                    <CalendarDaysIcon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold leading-tight">
                        <FormattedMessage
                          id="general.planned"
                          defaultMessage="Planned"
                        />
                        {' & '}
                        <FormattedMessage
                          id="general.ongoing"
                          defaultMessage="Ongoing"
                        />
                      </span>
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-[11px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {plannedAdvisoryCount}
                      </span>
                    </span>
                    {plannedLineIds.length > 0 && (
                      <span className="mt-1 block">
                        <LineBar lineIds={plannedLineIds} linkLines={false} />
                      </span>
                    )}
                  </span>
                  {plannedOpen ? (
                    <ChevronUpIcon className="size-4 shrink-0" />
                  ) : (
                    <ChevronDownIcon className="size-4 shrink-0" />
                  )}
                </button>

                <div
                  id="planned-advisories"
                  className={classNames(
                    plannedOpen ? 'block' : 'hidden sm:block',
                  )}
                >
                  <div className="hidden border-gray-200 border-b bg-gray-50/60 px-6 py-1 font-medium text-[11px] text-gray-500 uppercase tracking-wide sm:block dark:border-gray-700 dark:bg-gray-900/20 dark:text-gray-400">
                    <FormattedMessage
                      id="home.advisories.coming_up"
                      defaultMessage="Coming up"
                    />
                  </div>
                  {plannedBuckets.map((bucket) => (
                    <AdvisoryBucketSection
                      key={bucket.id}
                      advisorySummary={advisorySummary}
                      bucket={bucket}
                      detailsOpen={expandedBucketIds.includes(bucket.id)}
                      emphasis="standard"
                      issuesById={issuesById}
                      onToggle={() => toggleBucket(bucket.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex min-w-0 items-center gap-2 px-4 py-3 text-gray-800 text-xs sm:px-6 dark:text-gray-200">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-operational-light/10 text-operational-light ring-1 ring-operational-light/30 dark:bg-operational-dark/15 dark:text-operational-dark dark:ring-operational-dark/40">
              <CheckCircleIcon className="size-4" />
            </span>
            <FormattedMessage
              id="home.advisories.none_actionable"
              defaultMessage="No advisories needing attention"
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
  emphasis: 'current' | 'standard';
  issuesById: Record<string, Issue>;
  onToggle: () => void;
}) {
  const {
    advisorySummary,
    bucket,
    detailsOpen,
    emphasis,
    issuesById,
    onToggle,
  } = props;
  const config = BUCKET_CONFIG[bucket.id];
  const lineIds = collectAdvisoryLineIds({
    buckets: [bucket],
    issuesById,
  });
  const hasDisruption = bucket.issueIds.some(
    (issueId) => issuesById[issueId]?.type === 'disruption',
  );
  const detailId = `current-advisories-${bucket.id}-details`;
  const { Icon } = config;

  return (
    <section className="border-gray-200 border-b last:border-b-0 dark:border-gray-700">
      <button
        type="button"
        aria-expanded={detailsOpen}
        aria-controls={detailId}
        className={classNames(
          'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 px-4 py-2.5 text-left text-gray-800 text-sm transition-colors sm:px-6 dark:text-gray-200',
          {
            'bg-red-50/70 hover:bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-950/30':
              emphasis === 'current' && hasDisruption,
            'bg-blue-50/70 hover:bg-blue-50 dark:bg-blue-950/20 dark:hover:bg-blue-950/30':
              emphasis === 'current' && !hasDisruption,
            'hover:bg-gray-50 dark:hover:bg-gray-700/40':
              emphasis === 'standard',
          },
        )}
        onClick={onToggle}
      >
        <span
          className={classNames(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-full ring-1 sm:size-6',
            {
              'bg-red-100 text-red-700 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800':
                emphasis === 'current' && hasDisruption,
              'bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800':
                emphasis === 'current' && !hasDisruption,
              'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-700/60':
                bucket.id === 'later_today',
              'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-700/60':
                bucket.id === 'this_week',
              'bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600':
                bucket.id === 'background',
            },
          )}
        >
          <Icon className="size-4 sm:size-3.5" />
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate font-semibold leading-tight">
              <FormattedMessage {...config.label} />
            </span>
            <span className="shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 font-medium text-[11px] text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800/70 dark:text-gray-300 dark:ring-gray-600">
              <FormattedMessage
                {...config.countLabel}
                values={{ count: bucket.count }}
              />
            </span>
          </span>
          {lineIds.length > 0 && (
            <span className="mt-1 block sm:mt-0.5">
              <LineBar lineIds={lineIds} linkLines={false} />
            </span>
          )}
        </span>
        {detailsOpen ? (
          <ChevronUpIcon className="size-4 shrink-0" />
        ) : (
          <ChevronDownIcon className="size-4 shrink-0" />
        )}
      </button>

      {detailsOpen && (
        <div
          id={detailId}
          className="border-gray-200 border-t bg-gray-50/60 px-3 py-3 dark:border-gray-700 dark:bg-gray-900/20"
        >
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
