import { DateTime } from 'luxon';
import { isoDate, SG_TIMEZONE } from './dateTime';
import { selectIncludedEntities } from './includedEntities';
import { pickIssueTypes } from './issueAnalytics';
import { issueOverlapsRange, issueTouchesDate } from './issueIntervals';
import { getIssuesOverlappingRange } from './issueRange';

export async function getHistoryYearSummaryData(year: number) {
  const yearStart = DateTime.fromObject(
    { year, month: 1, day: 1 },
    { zone: SG_TIMEZONE },
  ).startOf('day');
  const yearEnd = yearStart.plus({ years: 1 });
  const { dataset, issues } = await getIssuesOverlappingRange(
    yearStart,
    yearEnd,
  );

  const summaryByMonth = Array.from({ length: 12 }, (_, index) => {
    const monthStart = DateTime.fromObject(
      { year, month: index + 1, day: 1 },
      { zone: SG_TIMEZONE },
    ).startOf('day');
    const monthEnd = monthStart.plus({ months: 1 });
    const monthIssues = issues.filter((issue) =>
      issueOverlapsRange(issue, monthStart, monthEnd),
    );
    return {
      month: isoDate(monthStart),
      issueCountsByType: pickIssueTypes(monthIssues),
      totalCount: monthIssues.length,
    };
  }).reverse();

  return {
    data: {
      startAt: isoDate(yearStart),
      endAt: isoDate(yearEnd.minus({ day: 1 })),
      summaryByMonth,
    },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: issues.map((issue) => issue.id),
      includeStationMembershipLines: true,
    }),
  };
}

export async function getHistoryYearMonthData(year: number, month: number) {
  const monthStart = DateTime.fromObject(
    { year, month, day: 1 },
    { zone: SG_TIMEZONE },
  ).startOf('day');
  const monthEnd = monthStart.plus({ months: 1 });
  const { dataset, issues } = await getIssuesOverlappingRange(
    monthStart,
    monthEnd,
  );
  const weeks = new Map<string, string[]>();

  for (
    let date = monthStart.startOf('week');
    date < monthEnd.endOf('week');
    date = date.plus({ week: 1 })
  ) {
    const key = `${date.weekYear}-W${date.weekNumber.toString().padStart(2, '0')}`;
    const issueIds = issues
      .filter((issue) =>
        issueOverlapsRange(
          issue,
          date.startOf('week'),
          date.startOf('week').plus({ week: 1 }),
        ),
      )
      .map((issue) => issue.id)
      .sort((a, b) => b.localeCompare(a));
    if (issueIds.length > 0 || !weeks.has(key)) {
      weeks.set(key, issueIds);
    }
  }

  return {
    data: {
      startAt: isoDate(monthStart),
      endAt: isoDate(monthEnd.minus({ day: 1 })),
      issuesByWeek: [...weeks.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([week, issueIds]) => ({
          week,
          issueIds,
        })),
    },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds: issues.map((issue) => issue.id),
      includeStationMembershipLines: true,
    }),
  };
}

export async function getHistoryDayData(
  year: number,
  month: number,
  day: number,
) {
  const date = DateTime.fromObject({ year, month, day }, { zone: SG_TIMEZONE });
  const { dataset, issues } = await getIssuesOverlappingRange(
    date.startOf('day'),
    date.plus({ day: 1 }).startOf('day'),
  );
  const issueIds = issues
    .filter((issue) => issueTouchesDate(issue, date))
    .map((issue) => issue.id)
    .sort((a, b) => b.localeCompare(a));

  return {
    data: {
      startAt: isoDate(date),
      endAt: isoDate(date),
      issueIds,
    },
    included: selectIncludedEntities(dataset.included, dataset.allIssues, {
      issueIds,
      includeStationMembershipLines: true,
    }),
  };
}
