import { describe, expect, it } from 'vitest';
import { linesTable, metadataTable, operatorsTable } from '~/db/schema';
import {
  getRootDataFromDb,
  ROOT_LAST_UPDATED_METADATA_KEY,
  type RootDataDb,
} from './root';
import { createDbBatchStub } from './testDbStub';

describe('getRootDataFromDb', () => {
  it('fetches only the compact root navigation data shape', async () => {
    const lineRows = [
      {
        id: 'BPLRT',
        name: { 'en-SG': 'Bukit Panjang LRT' },
        color: '#748274',
      },
    ];
    const metadataRows = [
      {
        key: ROOT_LAST_UPDATED_METADATA_KEY,
        value: '2026-07-01T00:00:00+08:00',
      },
    ];
    const operatorRows = [{ id: 'SMRT', name: 'SMRT' }];
    const { batch, calls, db, select } = createDbBatchStub<RootDataDb>([
      lineRows,
      metadataRows,
      operatorRows,
    ]);

    await expect(getRootDataFromDb(db)).resolves.toEqual({
      lineNavItems: lineRows,
      metadata: metadataRows,
      operatorNavItems: operatorRows,
    });

    expect(select).toHaveBeenCalledTimes(3);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      {
        selectionKeys: ['id', 'name', 'color'],
        table: linesTable,
        whereCalls: 0,
        orderByCalls: 1,
        groupByCalls: 0,
      },
      {
        selectionKeys: ['key', 'value'],
        table: metadataTable,
        whereCalls: 1,
        orderByCalls: 0,
        groupByCalls: 0,
        limitCalls: 1,
      },
      {
        selectionKeys: ['id', 'name'],
        table: operatorsTable,
        whereCalls: 0,
        orderByCalls: 1,
        groupByCalls: 0,
      },
    ]);
  });
});
