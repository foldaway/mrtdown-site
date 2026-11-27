import { describe, expect, it } from 'vitest';
import { loopViaStationId } from './stationArrivalBranches';

describe('loop arrival direction labels', () => {
  const path = ['CCK', 'PNX', 'BKP', 'SNJ', 'PTR', 'BKP', 'PNX', 'CCK'].map(
    (stationId) => ({ stationId }),
  );

  it('omits a branch-wide via where outbound and return visits disagree', () => {
    expect(loopViaStationId(path, 'BKP')).toBeUndefined();
    expect(loopViaStationId(path, 'PNX')).toBeUndefined();
  });

  it('keeps the direction for a unique boarding visit, including the loop anchor', () => {
    expect(loopViaStationId(path, 'CCK')).toBe('PNX');
    expect(loopViaStationId(path, 'SNJ')).toBe('PTR');
    expect(loopViaStationId(path, 'unknown')).toBeUndefined();
  });
});
