import { describe, expect, it, vi } from 'vitest';
import {
  linesNextTable,
  operatorsNextTable,
  stationsNextTable,
} from '../../../db/schema.js';
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

  it('stages only lines with read-model required fields', async () => {
    const { db, inserts } = createInsertDb();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lines = [
      {
        id: 'BPLRT',
        hash: 'changed',
        name: translation,
        type: 'lrt',
        color: '#748274',
        startedAt: '1999-11-06',
        endedAt: null,
        operatingHours: {
          weekdays: { start: '05:30', end: '23:30' },
          weekends: { start: '05:30', end: '23:30' },
        },
        serviceIds: ['BPLRT-service'],
        operators: [
          {
            operatorId: 'smrt',
            startedAt: '1999-11-06',
            endedAt: null,
          },
        ],
      },
      {
        id: 'missing-hours',
        hash: 'skipped',
        name: translation,
        type: 'mrt',
        color: '#000000',
        startedAt: '2026-01-01',
        endedAt: null,
        operatingHours: null,
        serviceIds: [],
        operators: [],
      },
    ] as Parameters<typeof insertLinesStaging>[1];

    await insertLinesStaging(db, lines);
    expect(warn).toHaveBeenCalledWith(
      '[PULL] Skipping 1 line(s) missing required fields: missing-hours (operatingHours)',
    );
    warn.mockRestore();
    expect(inserts).toEqual([
      {
        table: linesNextTable,
        rows: [
          {
            id: 'BPLRT',
            hash: 'changed',
            name: translation,
            type: 'lrt',
            color: '#748274',
            started_at: '1999-11-06',
            ended_at: null,
            operating_hours: {
              weekdays: { start: '05:30', end: '23:30' },
              weekends: { start: '05:30', end: '23:30' },
            },
            operators: [
              {
                operatorId: 'smrt',
                startedAt: '1999-11-06',
                endedAt: null,
              },
            ],
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
          },
        ],
      },
    ]);
  });
});
