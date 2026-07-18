import { describe, expect, it } from 'vitest';
import { deriveIssueInitialScope } from './issue';

describe('issue read-model scope', () => {
  it('derives and deduplicates referenced network entities', () => {
    expect(
      deriveIssueInitialScope({
        facilityRows: [
          { line_id: 'EWL', station_id: 'EW1' },
          { line_id: 'EWL', station_id: 'EW1' },
          { line_id: null, station_id: 'EW2' },
        ],
        serviceRows: [
          { service_id: 'ewl-main' },
          { service_id: 'ewl-main' },
          { service_id: 'ewl-branch' },
        ],
      }),
    ).toEqual({
      lineIds: ['EWL'],
      serviceIds: ['ewl-main', 'ewl-branch'],
      stationIds: ['EW1', 'EW2'],
    });
  });

  it('supports issues without network references', () => {
    expect(
      deriveIssueInitialScope({ facilityRows: [], serviceRows: [] }),
    ).toEqual({
      lineIds: [],
      serviceIds: [],
      stationIds: [],
    });
  });
});
