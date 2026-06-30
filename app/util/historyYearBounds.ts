import { DateTime } from 'luxon';

type HistoryYearBounds = {
  minYear: number;
  maxYearOffset: number;
};

export const HISTORY_YEAR_BOUNDS = {
  minYear: 2010,
  maxYearOffset: 0,
} as const satisfies HistoryYearBounds;

export function getHistoryYearMax(
  bounds: HistoryYearBounds,
  now: DateTime = DateTime.now(),
) {
  return now.year + bounds.maxYearOffset;
}

export function isHistoryYearInBounds(
  year: number,
  bounds: HistoryYearBounds,
  now: DateTime = DateTime.now(),
) {
  return year >= bounds.minYear && year <= getHistoryYearMax(bounds, now);
}

export function getHistoryNavigationYearOptions(
  now: DateTime = DateTime.now(),
) {
  const years = [];
  const maxYear = getHistoryYearMax(HISTORY_YEAR_BOUNDS, now);

  for (let year = maxYear; year >= HISTORY_YEAR_BOUNDS.minYear; year--) {
    years.push(year);
  }

  return years;
}
