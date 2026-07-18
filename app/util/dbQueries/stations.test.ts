import { describe, expect, it } from 'vitest';
import {
  mergeStationReadModelScope,
  resolveStationProfileStationId,
} from './stations';
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

describe('station read-model scope', () => {
  it('merges the root, community, and issue graph without duplicates', () => {
    expect(
      mergeStationReadModelScope({
        stationId: 'NS1',
        stationLineIds: ['NSL'],
        stationServiceIds: ['nsl-main'],
        communityLineIds: ['NSL', 'TEL'],
        communityStationIds: ['NS1', 'TE2'],
        issueScope: {
          lineIds: ['NSL', 'EWL'],
          serviceIds: ['nsl-main', 'ewl-main'],
          stationIds: ['NS1', 'NS2'],
        },
      }),
    ).toEqual({
      lineIds: ['NSL', 'TEL', 'EWL'],
      serviceIds: ['nsl-main', 'ewl-main'],
      stationIds: ['NS1', 'TE2', 'NS2'],
    });
  });

  it('keeps a no-issue station scoped to its own static graph', () => {
    expect(
      mergeStationReadModelScope({
        stationId: 'JS1',
        stationLineIds: ['JRL'],
        stationServiceIds: ['jrl-main'],
        communityLineIds: [],
        communityStationIds: [],
        issueScope: { lineIds: [], serviceIds: [], stationIds: [] },
      }),
    ).toEqual({
      lineIds: ['JRL'],
      serviceIds: ['jrl-main'],
      stationIds: ['JS1'],
    });
  });
});
