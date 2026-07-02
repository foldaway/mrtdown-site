import { expect, vi } from 'vitest';

export type QueryCall = {
  selectionKeys: string[];
  table: unknown;
  whereCalls: number;
  orderByCalls: number;
  groupByCalls: number;
  limitCalls?: number;
};

export type QueryRowHandler = {
  table: unknown;
  selectionKeys?: string[];
  rows: unknown[];
  terminalMethod: 'from' | 'where' | 'orderBy' | 'groupBy' | 'limit';
};

/**
 * Creates a minimal Drizzle select-chain stub for route query tests.
 * Each handler resolves rows when its configured terminal method is reached.
 */
export function createDbStub<TDb>(rowHandlers: QueryRowHandler[]) {
  const calls: QueryCall[] = [];
  const select = vi.fn((selection: Record<string, unknown>) => {
    const call: QueryCall = {
      selectionKeys: Object.keys(selection),
      table: undefined,
      whereCalls: 0,
      orderByCalls: 0,
      groupByCalls: 0,
    };
    calls.push(call);

    const resolveHandler = () =>
      rowHandlers.find((candidate) => {
        if (candidate.table !== call.table) {
          return false;
        }
        if (candidate.selectionKeys == null) {
          return true;
        }
        return (
          candidate.selectionKeys.length === call.selectionKeys.length &&
          candidate.selectionKeys.every(
            (key, index) => key === call.selectionKeys[index],
          )
        );
      });
    const resolveRows = () => resolveHandler()?.rows ?? [];
    const resolveOrContinue = (
      terminalMethod: QueryRowHandler['terminalMethod'],
    ) => {
      const handler = resolveHandler();
      return handler?.terminalMethod === terminalMethod
        ? Promise.resolve(resolveRows())
        : builder;
    };

    const builder = {
      from: vi.fn((table: unknown) => {
        call.table = table;
        return resolveOrContinue('from');
      }),
      where: vi.fn(() => {
        call.whereCalls += 1;
        return resolveOrContinue('where');
      }),
      orderBy: vi.fn(() => {
        call.orderByCalls += 1;
        return resolveOrContinue('orderBy');
      }),
      groupBy: vi.fn(() => {
        call.groupByCalls += 1;
        return resolveOrContinue('groupBy');
      }),
      limit: vi.fn(() => {
        call.limitCalls = (call.limitCalls ?? 0) + 1;
        return resolveOrContinue('limit');
      }),
    };

    return builder;
  });
  const batch = vi.fn((queryBatch: readonly Promise<unknown[]>[]) =>
    Promise.all(queryBatch),
  );

  return {
    batch,
    calls,
    db: { batch, select } as unknown as TDb,
    select,
  };
}

/**
 * Creates a Drizzle stub for code paths that build select queries and execute
 * them through `db.batch`, preserving query-shape call tracking for assertions.
 */
export function createDbBatchStub<TDb>(batchRows: unknown[]) {
  const calls: QueryCall[] = [];
  const queries: unknown[] = [];
  const select = vi.fn((selection: Record<string, unknown>) => {
    const call: QueryCall = {
      selectionKeys: Object.keys(selection),
      table: undefined,
      whereCalls: 0,
      orderByCalls: 0,
      groupByCalls: 0,
    };
    calls.push(call);

    const builder = {
      from: vi.fn((table: unknown) => {
        call.table = table;
        return builder;
      }),
      where: vi.fn(() => {
        call.whereCalls += 1;
        return builder;
      }),
      orderBy: vi.fn(() => {
        call.orderByCalls += 1;
        return builder;
      }),
      groupBy: vi.fn(() => {
        call.groupByCalls += 1;
        return builder;
      }),
      limit: vi.fn(() => {
        call.limitCalls = (call.limitCalls ?? 0) + 1;
        return builder;
      }),
    };
    queries.push(builder);
    return builder;
  });
  const batch = vi.fn(async (queryBatch: readonly unknown[]) => {
    expect(queryBatch).toEqual(queries);
    return batchRows;
  });

  return {
    batch,
    calls,
    db: { batch, select } as unknown as TDb,
    select,
  };
}
