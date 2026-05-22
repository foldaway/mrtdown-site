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
      hash: '2026-05-01\0Labour Day',
    });
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
