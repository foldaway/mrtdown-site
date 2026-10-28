import { describe, expect, it } from 'vitest';
import {
  linesNextTable,
  operatorsNextTable,
  stationsNextTable,
} from '../../../db/schema.js';
import { scheduledTimetableCanonicalFixture } from './scheduledTimetableCanonical.fixture';
import {
  insertLinesStaging,
  insertOperatorsStaging,
  insertStationsStaging,
} from './stagingSync';

type InsertDb = Parameters<typeof insertOperatorsStaging>[0];

function createInsertDb() {
  const inserts: Array<{
    rows: unknown[];
    table: unknown;
  }> = [];

  const db = {
    insert(table: unknown) {
      return {
        values(rows: unknown | unknown[]) {
          inserts.push({
            table,
            rows: Array.isArray(rows) ? rows : [rows],
          });
          return Promise.resolve();
        },
      };
    },
  } as unknown as InsertDb;

  return { db, inserts };
}

const translation = {
  'en-SG': 'Name',
  'zh-Hans': null,
  ms: null,
  ta: null,
};

describe('pull staging inserts', () => {
  it('batches operator staging inserts', async () => {
    const { db, inserts } = createInsertDb();
    const operators = Array.from({ length: 501 }, (_, index) => {
      return {
        id: `operator-${index}`,
        hash: `hash-${index}`,
        name: translation,
        foundedAt: '1987-11-07',
        url: null,
      };
    }) as Parameters<typeof insertOperatorsStaging>[1];

    await insertOperatorsStaging(db, operators);

    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toMatchObject({
      table: operatorsNextTable,
      rows: expect.arrayContaining([
        {
          id: 'operator-0',
          hash: 'hash-0',
          name: translation,
          founded_at: '1987-11-07',
          url: null,
        },
      ]),
    });
    expect(inserts[0].rows).toHaveLength(500);
    expect(inserts[1].rows).toHaveLength(1);
  });

  it('stages canonical lines without inventing missing dates or hours', async () => {
    const { db, inserts } = createInsertDb();
    const { canonical } = scheduledTimetableCanonicalFixture();
    const line = canonical.lines[0];
    const lines = [
      {
        ...line,
        hash: 'normal',
        operatingHours: canonical.services[0].revisions[0].operatingHours,
      },
      { ...line, id: 'unknown', hash: 'unknown', startedAt: null },
    ];

    expect(await insertLinesStaging(db, lines)).toBe(2);
    expect(inserts).toMatchObject([
      {
        table: linesNextTable,
        rows: [
          {
            id: 'line',
            started_at: '2000-01-01',
            operating_hours: lines[0].operatingHours,
            operators: line.operators,
          },
          {
            id: 'unknown',
            started_at: null,
            operating_hours: null,
            operators: line.operators,
          },
        ],
      },
    ]);
  });

  it('stages station geography and nested membership data', async () => {
    const { db, inserts } = createInsertDb();
    const stations = [
      {
        id: 'BP6',
        hash: 'station-hash',
        name: translation,
        geo: {
          latitude: 1.379,
          longitude: 103.761,
        },
        townId: 'bukit-panjang',
        stationCodes: [
          {
            lineId: 'BPLRT',
            code: 'BP6',
            structureType: 'elevated',
            startedAt: '1999-11-06',
            endedAt: null,
          },
        ],
        landmarkIds: ['bukit-panjang-plaza'],
        layout: {
          exitSourceId: 'lta-mrt-station-exit-geojson',
          exits: [
            {
              sourceObjectId: 123,
              sourceChecksum: '1234567890ABCDEF',
              label: 'Exit A',
              lastUpdated: '2026-07-21',
              geo: {
                latitude: 1.3791,
                longitude: 103.7611,
              },
            },
          ],
          platforms: [
            {
              id: 'BP6_BPLRT_A',
              label: 'A',
              lastUpdated: '2026-07-21',
              lineId: 'BPLRT',
              serviceIds: ['BPLRT_SERVICE'],
              inference: {
                method: 'same-line-platform-label',
                basis: [
                  {
                    stationId: 'BP5',
                    platformId: 'BP5_BPLRT_A',
                  },
                ],
              },
            },
          ],
        },
      },
    ] as Parameters<typeof insertStationsStaging>[1];

    await insertStationsStaging(db, stations);

    expect(inserts).toEqual([
      {
        table: stationsNextTable,
        rows: [
          {
            id: 'BP6',
            hash: 'station-hash',
            name: translation,
            geo: [103.761, 1.379],
            town_id: 'bukit-panjang',
            station_codes: [
              {
                lineId: 'BPLRT',
                code: 'BP6',
                structureType: 'elevated',
                startedAt: '1999-11-06',
                endedAt: null,
              },
            ],
            landmark_ids: ['bukit-panjang-plaza'],
            first_last_train: null,
            layout_exit_source_id: 'lta-mrt-station-exit-geojson',
            layout_exits: [
              {
                sourceObjectId: 123,
                sourceChecksum: '1234567890ABCDEF',
                label: 'Exit A',
                lastUpdated: '2026-07-21',
                geo: {
                  latitude: 1.3791,
                  longitude: 103.7611,
                },
              },
            ],
            layout_platforms: [
              {
                id: 'BP6_BPLRT_A',
                label: 'A',
                lastUpdated: '2026-07-21',
                lineId: 'BPLRT',
                serviceIds: ['BPLRT_SERVICE'],
                inference: {
                  method: 'same-line-platform-label',
                  basis: [
                    {
                      stationId: 'BP5',
                      platformId: 'BP5_BPLRT_A',
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ]);
  });
});
