import { describe, expect, it } from 'vitest';
import {
  collectAdvisoryLineIds,
  countOperationalLineSummaries,
} from './helpers';

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

describe('collectAdvisoryLineIds', () => {
  it('collects unique sorted lines across advisory buckets', () => {
    expect(
      collectAdvisoryLineIds({
        buckets: [
          { issueIds: ['planned-dtl', 'background-ewl'] },
          { issueIds: ['background-nsl', 'background-ewl'] },
        ],
        issuesById: {
          'planned-dtl': { lineIds: ['DTL'] },
          'background-ewl': { lineIds: ['EWL', 'NSL'] },
          'background-nsl': { lineIds: ['NSL'] },
        },
      }),
    ).toEqual(['DTL', 'EWL', 'NSL']);
  });

  it('ignores missing issue records', () => {
    expect(
      collectAdvisoryLineIds({
        buckets: [{ issueIds: ['known', 'missing'] }],
        issuesById: {
          known: { lineIds: ['BPLRT'] },
        },
      }),
    ).toEqual(['BPLRT']);
  });
});
