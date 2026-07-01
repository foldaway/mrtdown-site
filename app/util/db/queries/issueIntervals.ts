import { resolvePeriods } from '@mrtdown/core';
import type { DateTime } from 'luxon';
import type { Issue, IssueInterval } from '~/types';
import { isoDateTime, nowSg, parseDateTime } from './temporal';

export type IssueIntervalBounds = {
  start: DateTime;
  end: DateTime | null;
};

const issueBoundsCache = new WeakMap<Issue, IssueIntervalBounds[]>();

export function mergeIntervals(intervals: IssueIntervalBounds[]) {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort(
    (a, b) => a.start.toMillis() - b.start.toMillis(),
  );
  const merged: IssueIntervalBounds[] = [];

  for (const interval of sorted) {
    const current = merged.at(-1);
    if (current == null) {
      merged.push({ ...interval });
      continue;
    }

    const currentEnd = current.end?.toMillis() ?? Number.POSITIVE_INFINITY;
    const nextEnd = interval.end?.toMillis() ?? Number.POSITIVE_INFINITY;

    if (interval.start.toMillis() <= currentEnd) {
      if (current.end == null || interval.end == null) {
        current.end = null;
      } else if (nextEnd > currentEnd) {
        current.end = interval.end;
      }
      continue;
    }

    merged.push({ ...interval });
  }

  return merged;
}

export function sumIntervalSeconds(
  intervals: IssueIntervalBounds[],
  referenceNow = nowSg(),
) {
  return mergeIntervals(intervals).reduce((total, interval) => {
    const end = interval.end ?? referenceNow;
    return total + Math.max(0, end.diff(interval.start, 'seconds').seconds);
  }, 0);
}

export function overlapSeconds(
  start: DateTime,
  end: DateTime | null,
  windowStart: DateTime,
  windowEnd: DateTime,
  referenceNow = nowSg(),
) {
  const boundedEnd = end ?? referenceNow;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = boundedEnd < windowEnd ? boundedEnd : windowEnd;
  return Math.max(0, overlapEnd.diff(overlapStart, 'seconds').seconds);
}

export function clipIssueIntervalsToRange(
  issue: Issue,
  windowStart: DateTime,
  windowEnd: DateTime,
  referenceNow = nowSg(),
) {
  return getIssueBounds(issue)
    .map((interval) =>
      clipIntervalToRange(
        interval.start,
        interval.end,
        windowStart,
        windowEnd,
        referenceNow,
      ),
    )
    .filter((interval): interval is IssueIntervalBounds => interval != null);
}

export function clipIntervalToRange(
  start: DateTime,
  end: DateTime | null,
  windowStart: DateTime,
  windowEnd: DateTime,
  referenceNow = nowSg(),
): IssueIntervalBounds | null {
  const boundedEnd = end ?? referenceNow;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = boundedEnd < windowEnd ? boundedEnd : windowEnd;
  if (overlapEnd <= overlapStart) {
    return null;
  }
  return { start: overlapStart, end: overlapEnd };
}

export function classifyInterval(
  startAt: string,
  endAt: string | null,
  referenceNow = nowSg(),
): IssueInterval['status'] {
  const start = parseDateTime(startAt);
  if (start > referenceNow) {
    return 'future';
  }

  if (endAt == null) {
    return 'ongoing';
  }

  const end = parseDateTime(endAt);
  return end > referenceNow ? 'ongoing' : 'ended';
}

export function buildIssueIntervals(
  rows: Array<{
    start_at: string;
    end_at_resolved: string | null;
    end_at: string | null;
  }>,
  referenceNow = nowSg(),
) {
  const unique = new Map<string, IssueInterval>();

  for (const row of rows) {
    const normalizedStartAt = isoDateTime(parseDateTime(row.start_at));
    const resolvedEndAtRaw = row.end_at_resolved ?? row.end_at ?? null;
    const normalizedEndAt =
      resolvedEndAtRaw != null
        ? isoDateTime(parseDateTime(resolvedEndAtRaw))
        : null;
    const key = `${normalizedStartAt}::${normalizedEndAt ?? 'null'}`;
    if (unique.has(key)) {
      continue;
    }

    unique.set(key, {
      startAt: normalizedStartAt,
      endAt: normalizedEndAt,
      status: classifyInterval(
        normalizedStartAt,
        normalizedEndAt,
        referenceNow,
      ),
    });
  }

  return [...unique.values()].sort((a, b) => {
    return (
      parseDateTime(a.startAt).toMillis() - parseDateTime(b.startAt).toMillis()
    );
  });
}

export function resolveOperationalIssueIntervals(
  rows: Array<{
    start_at: string;
    end_at: string | null;
  }>,
  lastEvidenceAt: DateTime | null,
  asOf = nowSg(),
) {
  if (rows.length === 0) {
    return [];
  }

  const resolved = resolvePeriods({
    periods: rows.map((row) => ({
      kind: 'fixed' as const,
      startAt: isoDateTime(parseDateTime(row.start_at)),
      endAt: row.end_at != null ? isoDateTime(parseDateTime(row.end_at)) : null,
    })),
    asOf: isoDateTime(asOf),
    mode: {
      kind: 'operational',
      lastEvidenceAt: lastEvidenceAt?.toISO() ?? null,
    },
  });

  return buildIssueIntervals(
    resolved.map((period) => ({
      start_at: period.startAt,
      end_at_resolved: period.endAtResolved,
      end_at: period.endAt,
    })),
    asOf,
  );
}

export function getIssueBounds(issue: Issue): IssueIntervalBounds[] {
  const cached = issueBoundsCache.get(issue);
  if (cached != null) {
    return cached;
  }

  const bounds = mergeIntervals(
    issue.intervals.map((interval) => ({
      start: parseDateTime(interval.startAt),
      end: interval.endAt != null ? parseDateTime(interval.endAt) : null,
    })),
  );
  issueBoundsCache.set(issue, bounds);
  return bounds;
}

export function issueTouchesDate(issue: Issue, date: DateTime) {
  const dayStart = date.startOf('day');
  const dayEnd = dayStart.plus({ day: 1 });
  return getIssueBounds(issue).some((interval) => {
    return overlapSeconds(interval.start, interval.end, dayStart, dayEnd) > 0;
  });
}

export function issueOverlapsRange(
  issue: Issue,
  rangeStart: DateTime,
  rangeEnd: DateTime,
) {
  return getIssueBounds(issue).some((interval) => {
    return (
      overlapSeconds(interval.start, interval.end, rangeStart, rangeEnd) > 0
    );
  });
}

export function issueActiveNow(issue: Issue, referenceNow = nowSg()) {
  return getIssueBounds(issue).some((interval) => {
    return (
      interval.start <= referenceNow &&
      (interval.end == null || interval.end > referenceNow)
    );
  });
}

export function issueActiveToday(issue: Issue, referenceNow = nowSg()) {
  const dayStart = referenceNow.startOf('day');
  const dayEnd = dayStart.plus({ day: 1 });
  return getIssueBounds(issue).some((interval) => {
    return overlapSeconds(interval.start, interval.end, dayStart, dayEnd) > 0;
  });
}

export function sortIssuesByLatestActivity(
  issueIds: string[],
  issuesById: Record<string, Issue>,
) {
  return [...issueIds].sort((a, b) => {
    const issueA = issuesById[a];
    const issueB = issuesById[b];
    const latestA = Math.max(
      ...issueA.intervals.map((interval) =>
        parseDateTime(interval.endAt ?? interval.startAt).toMillis(),
      ),
    );
    const latestB = Math.max(
      ...issueB.intervals.map((interval) =>
        parseDateTime(interval.endAt ?? interval.startAt).toMillis(),
      ),
    );
    return latestB - latestA;
  });
}
