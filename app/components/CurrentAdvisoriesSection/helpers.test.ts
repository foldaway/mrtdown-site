import { describe, expect, it } from 'vitest';
import { countOperationalLinesOutsideCurrentAdvisories } from './helpers';

describe('countOperationalLinesOutsideCurrentAdvisories', () => {
  it('excludes normal lines that already appear in service advisories', () => {
    expect(
      countOperationalLinesOutsideCurrentAdvisories({
        issuesActiveNow: [{ lineIds: ['NSL'] }],
        issuesActiveToday: [{ lineIds: ['EWL'] }],
        lineSummaries: [
          { lineId: 'NSL', status: 'ongoing_disruption' },
          { lineId: 'EWL', status: 'normal' },
          { lineId: 'CCL', status: 'normal' },
          { lineId: 'DTL', status: 'closed_for_day' },
        ],
      }),
    ).toBe(1);
  });

  it('deduplicates advisories that touch the same line', () => {
    expect(
      countOperationalLinesOutsideCurrentAdvisories({
        issuesActiveNow: [{ lineIds: ['NSL'] }],
        issuesActiveToday: [{ lineIds: ['NSL', 'EWL'] }],
        lineSummaries: [
          { lineId: 'NSL', status: 'normal' },
          { lineId: 'EWL', status: 'normal' },
          { lineId: 'CCL', status: 'normal' },
        ],
      }),
    ).toBe(1);
  });
});
