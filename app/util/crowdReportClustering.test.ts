import { describe, expect, it } from 'vitest';
import {
  buildCrowdReportClusteringLockKey,
  crowdReportContextsMatch,
  type CrowdReportClusterContext,
} from './crowdReportClustering';

const CONTEXT: CrowdReportClusterContext = {
  lineIds: ['EWL'],
  stationIds: ['BNV'],
  effect: 'delay',
  directionText: 'towards:PSR',
};

describe('crowd report incident matching', () => {
  it.each([
    { stationIds: ['OTP'] },
    { stationIds: [] },
    { effect: 'unknown' as const },
    { directionText: 'not-sure' },
    { directionText: null },
    { directionText: '  TOWARDS:PSR  ' },
    { stationIds: ['OTP'], effect: 'unknown' as const, directionText: null },
  ])('matches variations on the same line: %j', (variation) => {
    const other = { ...CONTEXT, ...variation };
    expect(crowdReportContextsMatch(CONTEXT, other)).toBe(true);
    expect(crowdReportContextsMatch(other, CONTEXT)).toBe(true);
    expect(buildCrowdReportClusteringLockKey(other)).toBe(
      buildCrowdReportClusteringLockKey(CONTEXT),
    );
  });

  it.each([
    { lineIds: ['CCL'] },
    { lineIds: ['EWL', 'CCL'] },
    { lineIds: [] },
    { effect: 'crowding' as const },
    { directionText: 'towards:TLK' },
  ])('keeps distinct context separate: %j', (variation) => {
    expect(
      crowdReportContextsMatch(CONTEXT, { ...CONTEXT, ...variation }),
    ).toBe(false);
  });

  it('compares line sets regardless of order and duplicate IDs', () => {
    const left = { ...CONTEXT, lineIds: ['EWL', 'CCL'] };
    const right = { ...CONTEXT, lineIds: ['CCL', 'EWL', 'EWL'] };
    expect(crowdReportContextsMatch(left, right)).toBe(true);
    expect(buildCrowdReportClusteringLockKey(left)).toBe(
      buildCrowdReportClusteringLockKey(right),
    );
  });

  it('requires matching station sets when neither report identifies a line', () => {
    const left = { ...CONTEXT, lineIds: [] };
    expect(crowdReportContextsMatch(left, { ...left, effect: 'unknown' })).toBe(
      true,
    );
    expect(
      crowdReportContextsMatch(left, { ...left, stationIds: ['OTP'] }),
    ).toBe(false);
    expect(
      crowdReportContextsMatch(
        { ...left, stationIds: [] },
        { ...left, stationIds: [] },
      ),
    ).toBe(false);
  });
});
