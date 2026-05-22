import { describe, expect, it } from 'vitest';
import { countOperationalLineSummaries } from './helpers';

describe('countOperationalLineSummaries', () => {
  it('counts normal line summaries as operational', () => {
    expect(
      countOperationalLineSummaries({
        lineSummaries: [
          { lineId: 'NSL', status: 'ongoing_disruption' },
          { lineId: 'EWL', status: 'normal' },
          { lineId: 'CCL', status: 'normal' },
          { lineId: 'DTL', status: 'closed_for_day' },
        ],
      }),
    ).toBe(2);
  });

  it('does not count closed or future lines as operational', () => {
    expect(
      countOperationalLineSummaries({
        lineSummaries: [
          { lineId: 'NSL', status: 'normal' },
          { lineId: 'EWL', status: 'closed_for_day' },
          { lineId: 'CCL', status: 'future_service' },
          { lineId: 'DTL', status: 'ongoing_maintenance' },
        ],
      }),
    ).toBe(1);
  });
});
