import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { AppDb } from '~/db';
import { operatorsTable } from '~/db/schema';
import { getOperatorProfileDataFromDb } from './operators';
import { createDbStub } from './testDbStub';

describe('getOperatorProfileDataFromDb', () => {
  it('fails missing operators after a scoped operator lookup', async () => {
    const { calls, db, select } = createDbStub<AppDb>([
      {
        table: operatorsTable,
        rows: [],
        terminalMethod: 'where',
      },
    ]);

    await expect(
      getOperatorProfileDataFromDb(
        db,
        'missing-operator',
        30,
        DateTime.fromISO('2026-07-03T12:00:00+08:00'),
      ),
    ).rejects.toMatchObject({
      status: 404,
      statusText: 'Not Found',
    });

    expect(select).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        selectionKeys: ['id', 'name', 'founded_at', 'url'],
        table: operatorsTable,
        whereCalls: 1,
        orderByCalls: 0,
        groupByCalls: 0,
      },
    ]);
  });
});
