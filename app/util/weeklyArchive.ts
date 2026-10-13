import { DateTime } from 'luxon';
import { REPORT_ZONE } from './weeklyReport';

export function buildWeeklyArchive(earliestDate: string, currentDate: string) {
  const first = DateTime.fromISO(earliestDate, { zone: REPORT_ZONE }).startOf(
    'week',
  );
  const current = DateTime.fromISO(currentDate, { zone: REPORT_ZONE }).startOf(
    'week',
  );
  if (!first.isValid || !current.isValid || first > current) return [];
  const weeks: Array<{ week: string; year: number }> = [];
  for (
    let start = current.minus({ weeks: 1 });
    start >= first;
    start = start.minus({ weeks: 1 })
  ) {
    weeks.push({
      week: start.toISODate() as string,
      year: start.year,
    });
  }
  return weeks;
}
