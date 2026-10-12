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
      previousStart,
      end,
      now,
    );
    return {
      week: data.week,
      endDate: fullEnd.minus({ days: 1 }).toISODate() as string,
      asOf: isoDateTime(now),
      partial: end < fullEnd,
      currentWeek: now.startOf('week').toISODate() as string,
      current: buildWeeklySummary(
        issues,
        dataset.included.lines,
        start,
        end,
        now,
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
