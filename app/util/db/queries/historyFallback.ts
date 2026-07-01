import { DateTime } from 'luxon';

const SG_TIMEZONE = 'Asia/Singapore';

type OperationalFactCoverageStart =
  | {
      status: 'available';
      startDate: string;
    }
  | {
      status: 'missing_table';
    };

export function hasFullDateCoverage(
  rows: Array<{ date: string }>,
  start: DateTime,
  end: DateTime,
) {
  const expectedDays =
    Math.floor(end.startOf('day').diff(start.startOf('day'), 'days').days) + 1;
  if (expectedDays <= 0) {
    return false;
  }

  const dates = new Set(rows.map((row) => row.date));
  return dates.size === expectedDays;
}

export function selectLegacyHistoryFallback(
  start: DateTime,
  end: DateTime,
  today: DateTime,
  coverageRows: Array<{ date: string }>,
  coverageStart: OperationalFactCoverageStart,
  context: string,
) {
  if (end.startOf('day') >= today) {
    return true;
  }

  const coverageEnd = end.startOf('day') < today ? end.startOf('day') : today;
  if (coverageEnd < start.startOf('day')) {
    return false;
  }

  if (hasFullDateCoverage(coverageRows, start, coverageEnd)) {
    return false;
  }

  if (coverageStart.status === 'missing_table') {
    return true;
  }

  if (
    coverageStart.startDate != null &&
    start.startOf('day') <
      DateTime.fromISO(coverageStart.startDate, { zone: SG_TIMEZONE })
  ) {
    return true;
  }

  throw new Error(
    `Missing operational fact coverage for ${context}: ${start.toISODate()} to ${coverageEnd.toISODate()}`,
  );
}
