import { createServerFn } from '@tanstack/react-start';
import { DateTime } from 'luxon';
import z from 'zod';
import { isoDateTime, nowSg } from './dbQueries/dateTime';
import { getIssuesOverlappingRange } from './dbQueries/issueRange';
import { getSitemapData } from './dbQueries/sitemap';
import { buildWeeklySummary, getReportWeek } from './weeklyReport';

export const getWeeklyReportFn = createServerFn({ method: 'GET' })
  .inputValidator((value) => z.object({ week: z.string() }).parse(value))
  .handler(async ({ data }) => {
    const now = nowSg();
    let start: DateTime;
    try {
      start = getReportWeek(data.week, now);
    } catch {
      return null;
    }
    const archive = await getSitemapData();
    if (!archive.reportEarliestDate) return null;
    const earliestWeek = DateTime.fromISO(archive.reportEarliestDate, {
      zone: 'Asia/Singapore',
    })
      .startOf('week')
      .toISODate();
    if (earliestWeek == null)
      throw new Error('Invalid weekly archive boundary');
    if (data.week < earliestWeek) return null;

    const fullEnd = start.plus({ weeks: 1 });
    const end = fullEnd < now ? fullEnd : now;
    const previousStart = start.minus({ weeks: 1 });
    // Compare an unfinished week with the same elapsed portion of last week.
    const previousEnd = end.minus({ weeks: 1 });
    const { dataset, issues } = await getIssuesOverlappingRange(
      start.minus({ weeks: 4 }),
      end,
      now,
    );
    return {
      week: data.week,
      earliestWeek,
      endDate: fullEnd.minus({ days: 1 }).toISODate() as string,
      asOf: isoDateTime(now),
      partial: end < fullEnd,
      currentWeek: now.startOf('week').toISODate() as string,
      recentWeeks: Array.from({ length: 4 }, (_, index) => {
        const weekStart = start.minus({ weeks: index + 1 });
        if (
          weekStart < DateTime.fromISO(earliestWeek, { zone: 'Asia/Singapore' })
        )
          return null;
        const summary = buildWeeklySummary(
          issues,
          dataset.included.lines,
          weekStart,
          weekStart.plus({ weeks: 1 }),
          now,
        );
        return {
          disruptionCount: summary.disruptionCount,
          disruptionSeconds: summary.disruptionSeconds,
          lineIssueIds: summary.readerContext.lineIssueIds,
        };
      }).filter((week) => week != null),
      current: buildWeeklySummary(
        issues,
        dataset.included.lines,
        start,
        end,
        now,
        dataset.included.stations,
      ),
      previous:
        data.week === earliestWeek
          ? null
          : buildWeeklySummary(
              issues,
              dataset.included.lines,
              previousStart,
              previousEnd,
              now,
            ),
    };
  });
