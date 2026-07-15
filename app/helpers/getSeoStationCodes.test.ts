import { describe, expect, it } from 'vitest';
import { getSeoStationCodes } from './getSeoStationCodes';

describe('getSeoStationCodes', () => {
  it('excludes a closed code when the same line has an active replacement', () => {
    expect(
      getSeoStationCodes(
        [
          { code: 'DT32', lineId: 'DTL', startedAt: '2024-01-01' },
          { code: 'EW2', lineId: 'EWL', startedAt: '2001-01-01' },
          {
            code: 'EW2A',
            endedAt: '2001-01-01',
            lineId: 'EWL',
            startedAt: '1990-01-01',
          },
        ],
        '2026-07-16',
      ),
    ).toEqual(['DT32', 'EW2']);
  });

  it('deduplicates visible station codes', () => {
    expect(
      getSeoStationCodes(
        [
          { code: 'BP6', lineId: 'BPLRT', startedAt: '1999-01-01' },
          { code: 'BP6', lineId: 'BPLRT', startedAt: '1999-01-01' },
        ],
        '2026-07-16',
      ),
    ).toEqual(['BP6']);
  });
});
