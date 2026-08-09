import { crowdArrivalReportsTable } from '~/db/schema';
import { describe, expect, it, vi } from 'vitest';
import { getLatestCrowdArrivalReports } from './crowdArrivalReports';

describe('getLatestCrowdArrivalReports', () => {
  it('uses a distinct-on query for each reporter and service', () => {
    const orderBy = vi.fn();
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const selectDistinctOn = vi.fn(() => ({ from }));

    getLatestCrowdArrivalReports({
      db: { selectDistinctOn } as unknown as Parameters<
        typeof getLatestCrowdArrivalReports
      >[0]['db'],
      stationId: 'STN',
      serviceIds: ['service-a'],
      reportedAtOrAfter: '2026-08-08T00:00:00+08:00',
    });

    expect(selectDistinctOn).toHaveBeenCalledWith(
      [
        crowdArrivalReportsTable.service_id,
        crowdArrivalReportsTable.reporter_hash,
      ],
      expect.objectContaining({
        reporterHash: crowdArrivalReportsTable.reporter_hash,
        serviceId: crowdArrivalReportsTable.service_id,
      }),
    );
    expect(orderBy).toHaveBeenCalledOnce();
    expect(orderBy.mock.calls[0]?.slice(0, 2)).toEqual([
      crowdArrivalReportsTable.service_id,
      crowdArrivalReportsTable.reporter_hash,
    ]);
  });
});
