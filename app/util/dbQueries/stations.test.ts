import { describe, expect, it } from 'vitest';
import { resolveStationProfileStationId } from './stations';
import { TEST_STATION } from './testFixtures';

describe('resolveStationProfileStationId', () => {
  it('keeps canonical station ids unchanged', () => {
    expect(
      resolveStationProfileStationId(
        { stations: { [TEST_STATION.id]: TEST_STATION } },
        TEST_STATION.id,
      ),
    ).toBe(TEST_STATION.id);
  });

  it('resolves station-code aliases to their canonical station id', () => {
    const station = {
      ...TEST_STATION,
      id: 'BKP',
    };

    expect(
      resolveStationProfileStationId(
        { stations: { [station.id]: station } },
        'BP6',
      ),
    ).toBe('BKP');
  });

  it('returns null for unknown station ids or codes', () => {
    expect(
      resolveStationProfileStationId(
        { stations: { [TEST_STATION.id]: TEST_STATION } },
        'NOPE',
      ),
    ).toBeNull();
  });
});
