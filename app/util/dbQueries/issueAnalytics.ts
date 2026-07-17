import type { IssueType } from '@mrtdown/core';
import type { IssueDayFactRow } from './analyticsShared';
import { nowSg } from './dateTime';
import {
  ISSUE_TYPES,
  type IssueIntervalBounds,
  sumIntervalSeconds,
} from './issueIntervals';

export type IssueTypeCounts = Record<IssueType, number>;

export type IssueTypeBreakdown = IssueTypeCounts & {
  totalIssues: number;
};

export function pickIssueTypes<T extends { type: IssueType }>(items: T[]) {
  const counts: Partial<Record<IssueType, number>> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}

export function emptyIssueTypePayload(): Record<IssueType, number> {
  return { disruption: 0, maintenance: 0, infra: 0 };
}

export function groupIssueFactRowsByDate<T extends { date: string }>(
  rows: T[],
) {
  const rowsByDate = new Map<string, T[]>();
  for (const row of rows) {
    const dayRows = rowsByDate.get(row.date);
    if (dayRows == null) {
      rowsByDate.set(row.date, [row]);
      continue;
    }
    dayRows.push(row);
  }
  return rowsByDate;
}

export function pickIssueDurationByType<
  T extends { type: IssueType; durationSeconds: number },
>(items: T[]) {
  const counts: Partial<Record<IssueType, number>> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + item.durationSeconds;
  }
  return counts;
}

export function createIssueTypeCounts(): IssueTypeCounts {
  return {
    disruption: 0,
    maintenance: 0,
    infra: 0,
  };
}

export function createIssueTypeIntervalGroups(): Record<
  IssueType,
  IssueIntervalBounds[]
> {
  return {
    disruption: [],
    maintenance: [],
    infra: [],
  };
}

export function sumIssueTypeIntervalGroups(
  intervalGroups: Record<IssueType, IssueIntervalBounds[]>,
  referenceNow = nowSg(),
) {
  const counts = createIssueTypeCounts();
  for (const issueType of ISSUE_TYPES) {
    counts[issueType] = sumIntervalSeconds(
      intervalGroups[issueType],
      referenceNow,
    );
  }
  return counts;
}

export function createIssueTypeBreakdown(): IssueTypeBreakdown {
  return {
    ...createIssueTypeCounts(),
    totalIssues: 0,
  };
}

export function addIssueTypeCount(
  counts: IssueTypeCounts,
  issueType: IssueType,
  amount: number,
) {
  counts[issueType] += amount;
}

export function groupIssueFactCountsByDate(
  rows: IssueDayFactRow[],
  durationMode = false,
) {
  const countsByDate = new Map<string, IssueTypeCounts>();

  for (const row of rows) {
    const amount = durationMode
      ? row.duration_seconds
      : row.active_anytime
        ? 1
        : 0;
    if (amount === 0) {
      continue;
    }

    let counts = countsByDate.get(row.date);
    if (counts == null) {
      counts = createIssueTypeCounts();
      countsByDate.set(row.date, counts);
    }

    addIssueTypeCount(counts, row.issue_type, amount);
  }

  return countsByDate;
}
