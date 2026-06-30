import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  fetchDataGovPublicHolidays,
  normalizeDataGovPublicHolidayRecord,
} from './syncPublicHolidays';

describe('normalizeDataGovPublicHolidayRecord', () => {
  it('normalizes data.gov.sg public holiday rows', () => {
    expect(
      normalizeDataGovPublicHolidayRecord({
        date: '2026-05-01',
        day: 'Friday',
        holiday: 'Labour Day',
      }),
    ).toEqual({
      id: 'sg-public-holiday-2026-05-01-labour-day',
      date: '2026-05-01',
      holidayName: 'Labour Day',
      hash: '["2026-05-01","Labour Day"]',
    });
  });

  it('uses a database text-safe hash', () => {
    const row = normalizeDataGovPublicHolidayRecord({
      date: '2026-01-01',
      day: 'Thursday',
      holiday: "New Year's Day",
    });

    expect(row.hash).not.toContain('\0');
  });

  it('rejects invalid calendar dates', () => {
    expect(() =>
      normalizeDataGovPublicHolidayRecord({
        date: '2026-02-30',
        day: 'Monday',
        holiday: 'Invalid Holiday',
      }),
    ).toThrow('Invalid public holiday date: 2026-02-30');
  });
});

describe('fetchDataGovPublicHolidays', () => {
  it('fetches and normalizes paginated records', async () => {
    const fetches: string[] = [];
    const fetchImpl = async (url: URL | RequestInfo) => {
      const href = url.toString();
      fetches.push(href);
      const offset = new URL(href).searchParams.get('offset');
      return Response.json({
        success: true,
        result: {
          total: 2,
          records:
            offset === '0'
              ? [
                  {
                    date: '2026-01-01',
                    day: 'Thursday',
                    holiday: "New Year's Day",
                  },
                ]
              : [
                  {
                    date: '2026-05-01',
                    day: 'Friday',
                    holiday: 'Labour Day',
                  },
                ],
        },
      });
    };

    const rows = await fetchDataGovPublicHolidays(fetchImpl);

    expect(fetches).toHaveLength(2);
    expect(new URL(fetches[1]).searchParams.get('offset')).toBe('1');
    expect(rows.map((row) => row.date)).toEqual(['2026-01-01', '2026-05-01']);
  });
});

describe('syncPublicHolidays retry markers', () => {
  it('persists pending rebuild dates before non-transactional D1 writes', () => {
    const source = readFileSync(
      new URL('./syncPublicHolidays.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('PENDING_PUBLIC_HOLIDAY_REBUILD_DATES_KEY');
    expect(source).toContain('readPendingPublicHolidayRebuildDates(db)');
    expect(source).toContain('writePendingPublicHolidayRebuildDates(tx');
    expect(
      source.indexOf('writePendingPublicHolidayRebuildDates(tx'),
    ).toBeLessThan(
      source.indexOf('for (const rows of chunk(upsertRows, D1_WRITE_BATCH))'),
    );
  });
});
