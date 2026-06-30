import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  getHistoryNavigationYearOptions,
  getHistoryYearMax,
  HISTORY_YEAR_BOUNDS,
  isHistoryYearInBounds,
} from './historyYearBounds';

const now = DateTime.fromISO('2026-06-30T12:00:00+08:00');

describe('history year bounds', () => {
  it('computes max year from the configured offset', () => {
    expect(getHistoryYearMax(HISTORY_YEAR_BOUNDS, now)).toBe(2026);
  });

  it('uses Singapore time for the current-year boundary', () => {
    const utcNewYearWindow = DateTime.fromISO('2026-12-31T16:30:00Z', {
      zone: 'utc',
    });

    expect(getHistoryYearMax(HISTORY_YEAR_BOUNDS, utcNewYearWindow)).toBe(2027);
    expect(
      isHistoryYearInBounds(2027, HISTORY_YEAR_BOUNDS, utcNewYearWindow),
    ).toBe(true);
  });

  it('checks years against the supplied bounds', () => {
    expect(isHistoryYearInBounds(2010, HISTORY_YEAR_BOUNDS, now)).toBe(true);
    expect(isHistoryYearInBounds(2009, HISTORY_YEAR_BOUNDS, now)).toBe(false);
    expect(isHistoryYearInBounds(2027, HISTORY_YEAR_BOUNDS, now)).toBe(false);
  });

  it('builds navigation years from newest to oldest', () => {
    expect(getHistoryNavigationYearOptions(now)).toEqual([
      2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015,
      2014, 2013, 2012, 2011, 2010,
    ]);
  });
});
