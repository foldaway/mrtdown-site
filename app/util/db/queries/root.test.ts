import { describe, expect, it, vi } from 'vitest';
import { linesTable, metadataTable, operatorsTable } from '~/db/schema';
import {
  getRootDataFromDb,
  ROOT_LAST_UPDATED_METADATA_KEY,
  type RootDataDb,
} from './root';

type QueryCall = {
  selectionKeys: string[];
  table: unknown;
  whereCalls: number;
  orderByCalls: number;
};

function createDbStub(rowsByTable: Map<unknown, unknown[]>) {
  const calls: QueryCall[] = [];
  const select = vi.fn((selection: Record<string, unknown>) => {
    const call: QueryCall = {
      selectionKeys: Object.keys(selection),
      table: undefined,
      whereCalls: 0,
      orderByCalls: 0,
    };
    calls.push(call);

    const builder = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
    };

    builder.from.mockImplementation((table: unknown) => {
      call.table = table;
      return builder;
    });
    builder.where.mockImplementation(() => {
      call.whereCalls += 1;
      return builder;
    });
    builder.orderBy.mockImplementation(() => {
      call.orderByCalls += 1;
      return Promise.resolve(rowsByTable.get(call.table) ?? []);
    });

    return builder;
  });

  return {
    calls,
    db: { select } as unknown as RootDataDb,
    select,
  };
}

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
    const { calls, db, select } = createDbStub(
      new Map<unknown, unknown[]>([
        [linesTable, lineRows],
        [metadataTable, metadataRows],
        [operatorsTable, operatorRows],
      ]),
    );

    await expect(getRootDataFromDb(db)).resolves.toEqual({
      lineNavItems: lineRows,
      metadata: metadataRows,
      operatorNavItems: operatorRows,
    });

    expect(select).toHaveBeenCalledTimes(3);
    expect(calls).toEqual([
      {
        selectionKeys: ['id', 'name', 'color'],
        table: linesTable,
        whereCalls: 0,
        orderByCalls: 1,
      },
      {
        selectionKeys: ['key', 'value'],
        table: metadataTable,
        whereCalls: 1,
        orderByCalls: 1,
      },
      {
        selectionKeys: ['id', 'name'],
        table: operatorsTable,
        whereCalls: 0,
        orderByCalls: 1,
      },
    ]);
  });
});
