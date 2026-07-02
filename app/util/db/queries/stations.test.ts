import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { AppDb } from '~/db';
import { stationsTable } from '~/db/schema';
import { getStationProfileDataFromDb } from './stations';
import { createDbStub } from './testDbStub';

describe('getStationProfileDataFromDb', () => {
  it('fails missing stations after a scoped station lookup', async () => {
    const { calls, db, select } = createDbStub<AppDb>([
      {
        table: stationsTable,
        rows: [],
        terminalMethod: 'where',
      },
    ]);

    await expect(
      getStationProfileDataFromDb(
        db,
        'missing-station',
        {},
        DateTime.fromISO('2026-07-02T12:00:00+08:00'),
      ),
    ).rejects.toMatchObject({
      status: 404,
      statusText: 'Not Found',
    });

    expect(select).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        selectionKeys: ['id', 'name', 'townId', 'latitude', 'longitude'],
        table: stationsTable,
        whereCalls: 1,
        orderByCalls: 0,
        groupByCalls: 0,
      },
    ]);
  });
});
