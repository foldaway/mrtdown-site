import type { ServiceEffectKind } from '@mrtdown/core';
import type { DateTime } from 'luxon';
import type { AdvisorySummary, AdvisorySummaryBucketId, Issue } from '~/types';
import { isoDateTime, SG_TIMEZONE } from './dateTime';
import {
  getIssueBounds,
  type IssueIntervalBounds,
  type IssueWithOperationalEffects,
  overlapSeconds,
} from './issueIntervals';

const ADVISORY_SUMMARY_BUCKET_IDS: AdvisorySummaryBucketId[] = [
  'now',
  'later_today',
  'this_week',
  'background',
];

const LONG_RUNNING_ADVISORY_INTERVAL_DAYS = 14;

const LONG_RUNNING_ADVISORY_SPAN_DAYS = 30;

const SOON_ADVISORY_HOURS = 48;

const ACTIONABLE_SERVICE_EFFECTS = new Set<ServiceEffectKind>([
  'no-service',
  'reduced-service',
  'service-hours-adjustment',
]);

type AdvisoryCandidate = {
  bucketId: AdvisorySummaryBucketId;
  issue: IssueWithOperationalEffects;
  interval: IssueIntervalBounds;
  isMajorServiceImpact: boolean;
};

export function buildAdvisorySummary({
  issues,
  referenceNow,
}: {
  issues: IssueWithOperationalEffects[];
  referenceNow: DateTime;
}): AdvisorySummary {
  const now = referenceNow.setZone(SG_TIMEZONE);
  const windowStart = now.startOf('day');
  const todayEnd = windowStart.plus({ days: 1 });
  const windowEnd = windowStart.plus({ days: 7 });

  const candidates = issues
    .map((issue) =>
      classifyIssueForAdvisorySummary({
        issue,
        now,
        todayEnd,
        windowStart,
        windowEnd,
      }),
    )
    .filter((candidate): candidate is AdvisoryCandidate => candidate != null);
  const candidatesByBucket = new Map<
    AdvisorySummaryBucketId,
    AdvisoryCandidate[]
  >();

  for (const candidate of candidates) {
    const bucket = candidatesByBucket.get(candidate.bucketId) ?? [];
    bucket.push(candidate);
    candidatesByBucket.set(candidate.bucketId, bucket);
  }

  return {
    generatedAt: isoDateTime(now),
    windowStart: isoDateTime(windowStart),
    windowEnd: isoDateTime(windowEnd),
    buckets: ADVISORY_SUMMARY_BUCKET_IDS.map((bucketId) => {
      const bucketCandidates = candidatesByBucket.get(bucketId) ?? [];
      const issueIds = bucketCandidates
        .sort(compareAdvisoryCandidates)
        .map((candidate) => candidate.issue.id);
      return {
        id: bucketId,
        issueIds,
        count: issueIds.length,
      };
    }),
  };
}

function classifyIssueForAdvisorySummary({
  issue,
  now,
  todayEnd,
  windowStart,
  windowEnd,
}: {
  issue: IssueWithOperationalEffects;
  now: DateTime;
  todayEnd: DateTime;
  windowStart: DateTime;
  windowEnd: DateTime;
}): AdvisoryCandidate | null {
  const intervals = getIssueBounds(issue);
  const interval = selectRelevantAdvisoryInterval(
    issue,
    intervals,
    now,
    windowEnd,
  );
  if (interval == null) {
    return null;
  }

  const isMajorServiceImpact = hasMajorServiceImpact(issue);
  const shouldDemote =
    issue.type !== 'disruption' &&
    isLongRunningAdvisoryIssue(issue, intervals) &&
    !isMajorServiceImpact &&
    !startsSoon(interval, now) &&
    !endsSoon(interval, now);
  const isActiveNow = interval.start <= now && intervalEndsAfter(interval, now);

  if (isActiveNow) {
    return {
      bucketId: shouldDemote ? 'background' : 'now',
      issue,
      interval,
      isMajorServiceImpact,
    };
  }

  if (interval.start >= now && interval.start < todayEnd) {
    return {
      bucketId: 'later_today',
      issue,
      interval,
      isMajorServiceImpact,
    };
  }

  if (
    overlapSeconds(interval.start, interval.end, windowStart, windowEnd) > 0
  ) {
    return {
      bucketId: shouldDemote ? 'background' : 'this_week',
      issue,
      interval,
      isMajorServiceImpact,
    };
  }

  return null;
}

function selectRelevantAdvisoryInterval(
  issue: IssueWithOperationalEffects,
  intervals: IssueIntervalBounds[],
  now: DateTime,
  windowEnd: DateTime,
) {
  const activeIntervals = intervals
    .filter(
      (interval) => interval.start <= now && intervalEndsAfter(interval, now),
    )
    .sort((a, b) => compareIntervalsForAdvisoryIssue(issue, a, b, now));
  if (activeIntervals[0] != null) {
    return activeIntervals[0];
  }

  return intervals
    .filter(
      (interval) =>
        interval.start >= now &&
        interval.start < windowEnd &&
        intervalEndsAfter(interval, now),
    )
    .sort((a, b) => compareIntervalsForAdvisoryIssue(issue, a, b, now))[0];
}

function compareIntervalsForAdvisoryIssue(
  issue: IssueWithOperationalEffects,
  a: IssueIntervalBounds,
  b: IssueIntervalBounds,
  now: DateTime,
) {
  const issueWeight = issue.type === 'disruption' ? -1 : 0;
  const aEndSoon = endsSoon(a, now) ? issueWeight - 1 : 0;
  const bEndSoon = endsSoon(b, now) ? issueWeight - 1 : 0;
  if (aEndSoon !== bEndSoon) {
    return aEndSoon - bEndSoon;
  }
  return a.start.toMillis() - b.start.toMillis();
}

function hasMajorServiceImpact(issue: IssueWithOperationalEffects) {
  return (
    issue.type === 'disruption' ||
    issue.serviceEffectKinds.some((kind) =>
      ACTIONABLE_SERVICE_EFFECTS.has(kind),
    )
  );
}

function isLongRunningAdvisoryIssue(
  issue: Issue,
  intervals: IssueIntervalBounds[],
) {
  if (intervals.some(isLongRunningAdvisoryInterval)) {
    return true;
  }

  if (intervals.length === 0) {
    return false;
  }

  const firstStart = intervals.reduce(
    (earliest, interval) =>
      interval.start < earliest ? interval.start : earliest,
    intervals[0].start,
  );
  const latestEnd = intervals.reduce<DateTime | null>((latest, interval) => {
    if (latest == null || interval.end == null) {
      return null;
    }
    return interval.end > latest ? interval.end : latest;
  }, intervals[0].end);

  if (latestEnd == null) {
    return true;
  }

  return (
    latestEnd.diff(firstStart, 'days').days >=
      LONG_RUNNING_ADVISORY_SPAN_DAYS ||
    issue.durationSeconds >= LONG_RUNNING_ADVISORY_INTERVAL_DAYS * 24 * 60 * 60
  );
}

function isLongRunningAdvisoryInterval(interval: IssueIntervalBounds) {
  if (interval.end == null) {
    return true;
  }

  return (
    interval.end.diff(interval.start, 'days').days >=
    LONG_RUNNING_ADVISORY_INTERVAL_DAYS
  );
}

function startsSoon(interval: IssueIntervalBounds, now: DateTime) {
  return (
    interval.start >= now &&
    interval.start.diff(now, 'hours').hours <= SOON_ADVISORY_HOURS
  );
}

function endsSoon(interval: IssueIntervalBounds, now: DateTime) {
  return (
    interval.end != null &&
    interval.end >= now &&
    interval.end.diff(now, 'hours').hours <= SOON_ADVISORY_HOURS
  );
}

function intervalEndsAfter(interval: IssueIntervalBounds, now: DateTime) {
  return interval.end == null || interval.end > now;
}

function compareAdvisoryCandidates(a: AdvisoryCandidate, b: AdvisoryCandidate) {
  const severityDiff = advisorySeverityRank(a) - advisorySeverityRank(b);
  if (severityDiff !== 0) {
    return severityDiff;
  }

  const scopeDiff = b.issue.lineIds.length - a.issue.lineIds.length;
  if (scopeDiff !== 0) {
    return scopeDiff;
  }

  const startDiff = a.interval.start.toMillis() - b.interval.start.toMillis();
  if (startDiff !== 0) {
    return startDiff;
  }

  return a.issue.id.localeCompare(b.issue.id);
}

function advisorySeverityRank(candidate: AdvisoryCandidate) {
  if (candidate.issue.type === 'disruption') {
    return 0;
  }

  if (candidate.isMajorServiceImpact) {
    return 1;
  }

  if (candidate.issue.type === 'maintenance') {
    return 2;
  }

  return 3;
}
