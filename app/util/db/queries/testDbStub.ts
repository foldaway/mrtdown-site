import { vi } from 'vitest';

export type QueryCall = {
  selectionKeys: string[];
  table: unknown;
  whereCalls: number;
  orderByCalls: number;
  groupByCalls: number;
};

export type QueryRowHandler = {
  table: unknown;
  selectionKeys?: string[];
  rows: unknown[];
  terminalMethod: 'from' | 'where' | 'orderBy' | 'groupBy';
};

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
    };

    return builder;
  });

  return {
    calls,
    db: { select } as unknown as TDb,
    select,
  };
}
