import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { isoDateTime, nowSg } from './dbQueries/dateTime';
import { getIssuesOverlappingRange } from './dbQueries/issueRange';
import { buildWeeklySummary, getReportWeek } from './weeklyReport';

export const getWeeklyReportFn = createServerFn({ method: 'GET' })
  .inputValidator((value) => z.object({ week: z.string() }).parse(value))
  .handler(async ({ data }) => {
    const now = nowSg();
    const start = getReportWeek(data.week, now);
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
      endDate: fullEnd.minus({ days: 1 }).toISODate() as string,
      asOf: isoDateTime(now),
      partial: end < fullEnd,
      currentWeek: now.startOf('week').toISODate() as string,
      recentWeeks: Array.from({ length: 4 }, (_, index) => {
        const weekStart = start.minus({ weeks: index + 1 });
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
      }),
      current: buildWeeklySummary(
        issues,
        dataset.included.lines,
        start,
        end,
        now,
        dataset.included.stations,
      ),
      previous: buildWeeklySummary(
        issues,
        dataset.included.lines,
        previousStart,
        previousEnd,
        now,
      ),
    };
  });
