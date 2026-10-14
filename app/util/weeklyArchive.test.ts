import { describe, expect, it } from 'vitest';
import { buildSitemapPaths } from './sitemap.functions';
import { buildWeeklyArchive } from './weeklyArchive';

describe('weekly archive discovery', () => {
  it('lists completed weeks newest first', () => {
    expect(buildWeeklyArchive('2026-09-29', '2026-10-13')).toEqual([
      { week: '2026-10-05', year: 2026 },
      { week: '2026-09-28', year: 2026 },
    ]);
  });
  it('does not invent reports for invalid or future bounds', () => {
    expect(buildWeeklyArchive('bad-date', '2026-10-13')).toEqual([]);
    expect(buildWeeklyArchive('2027-01-01', '2026-10-13')).toEqual([]);
  });
  it('includes the archive and completed issues in the sitemap, excluding the unfinished week', () => {
    const paths = buildSitemapPaths({
      lineIds: [],
      stationIds: [],
      townIds: [],
      operatorIds: [],
      issueIds: [],
      monthEarliest: '2026-09-01',
      reportEarliestDate: '2026-09-29',
      monthLatest: '2026-10-01',
      currentDate: '2026-10-13',
    });
    expect(paths).toContain('/reports/weekly');
    expect(paths).toContain('/reports/weekly/2026-09-28');
    expect(paths).toContain('/reports/weekly/2026-10-05');
    expect(paths).not.toContain('/reports/weekly/2026-10-12');
    expect(paths).not.toContain('/reports/weekly/2026-09-21');
    expect(paths).not.toContain('/reports/weekly/2026-08-31');
  });
});
