import { describe, expect, it } from 'vitest';
import { buildReferenceCatalog } from './referenceCatalog';

function names(
  english: string,
  chinese: string | null = null,
  tamil: string | null = null,
) {
  return {
    'en-SG': english,
    'zh-Hans': chinese,
    ms: null,
    ta: tamil,
  };
}

describe('buildReferenceCatalog', () => {
  it('returns only active lines, stations, and memberships', () => {
    const catalog = buildReferenceCatalog({
      datasetVersion: '2026-07-19T00:00:00.000Z',
      referenceDate: '2026-07-19',
      lines: [
        { id: 'FUTURE', startedAt: '2027-01-01', endedAt: null },
        { id: 'ACTIVE', startedAt: '2020-01-01', endedAt: null },
        { id: 'ENDED', startedAt: '2010-01-01', endedAt: '2025-12-31' },
      ],
      stations: [
        { id: 'STATION-B', name: names('Beta') },
        { id: 'STATION-A', name: names('Alpha', '阿尔法') },
        { id: 'STATION-C', name: names('Closed') },
      ],
      memberships: [
        {
          stationId: 'STATION-B',
          lineId: 'ACTIVE',
          publicCode: 'A2',
          startedAt: '2020-01-01',
          endedAt: null,
        },
        {
          stationId: 'STATION-A',
          lineId: 'ACTIVE',
          publicCode: 'A1',
          startedAt: '2020-01-01',
          endedAt: null,
        },
        {
          stationId: 'STATION-C',
          lineId: 'ENDED',
          publicCode: 'E1',
          startedAt: '2010-01-01',
          endedAt: '2025-12-31',
        },
        {
          stationId: 'STATION-A',
          lineId: 'FUTURE',
          publicCode: 'F1',
          startedAt: '2027-01-01',
          endedAt: null,
        },
      ],
    });

    expect(catalog).toEqual({
      schemaVersion: 1,
      datasetVersion: '2026-07-19T00:00:00.000Z',
      referenceDate: '2026-07-19',
      lines: [{ id: 'ACTIVE', validFrom: '2020-01-01', validTo: null }],
      stations: [
        {
          id: 'STATION-A',
          names: names('Alpha', '阿尔法'),
          aliases: ['Alpha', '阿尔法'],
          publicCodes: ['A1'],
        },
        {
          id: 'STATION-B',
          names: names('Beta'),
          aliases: ['Beta'],
          publicCodes: ['A2'],
        },
      ],
      memberships: [
        {
          stationId: 'STATION-A',
          lineId: 'ACTIVE',
          publicCode: 'A1',
          validFrom: '2020-01-01',
          validTo: null,
        },
        {
          stationId: 'STATION-B',
          lineId: 'ACTIVE',
          publicCode: 'A2',
          validFrom: '2020-01-01',
          validTo: null,
        },
      ],
    });
  });

  it('deduplicates searchable aliases and public codes', () => {
    const catalog = buildReferenceCatalog({
      datasetVersion: '2026-07-19T00:00:00.000Z',
      referenceDate: '2026-07-19',
      lines: [{ id: 'CCL', startedAt: '2009-05-28', endedAt: null }],
      stations: [
        {
          id: 'CC1',
          name: {
            'en-SG': 'Dhoby Ghaut',
            'zh-Hans': 'Dhoby Ghaut',
            ms: '  Dhoby Ghaut  ',
            ta: null,
          },
        },
      ],
      memberships: [
        {
          stationId: 'CC1',
          lineId: 'CCL',
          publicCode: 'CC1',
          startedAt: '2009-05-28',
          endedAt: null,
        },
        {
          stationId: 'CC1',
          lineId: 'CCL',
          publicCode: 'CC1',
          startedAt: '2010-01-01',
          endedAt: null,
        },
      ],
    });

    expect(catalog.stations[0]).toMatchObject({
      aliases: ['Dhoby Ghaut'],
      publicCodes: ['CC1'],
    });
  });
});
