import { describe, expect, it } from 'vitest';
import { getSeoStationCodes } from './getSeoStationCodes';

describe('getSeoStationCodes', () => {
  it('excludes closed station codes', () => {
    expect(
      getSeoStationCodes([
        { code: 'DT32' },
        { code: 'EW2' },
        { code: 'EW2A', endedAt: '2001-01-01' },
      ]),
    ).toEqual(['DT32', 'EW2']);
  });

  it('deduplicates active station codes', () => {
    expect(getSeoStationCodes([{ code: 'BP6' }, { code: 'BP6' }])).toEqual([
      'BP6',
    ]);
  });
});
