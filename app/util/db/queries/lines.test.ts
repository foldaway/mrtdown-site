import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { AppDb } from '~/db';
import {
  lineDayFactsTable,
  lineOperatorsTable,
  linesTable,
  publicHolidaysTable,
} from '~/db/schema';
import { getLineProfileDataFromDb } from './lines';
import { createDbStub } from './testDbStub';

describe('getLineProfileDataFromDb', () => {
  it('fails missing lines after compact line and fact lookups', async () => {
    const { calls, db, select } = createDbStub<AppDb>([
      {
        table: linesTable,
        rows: [],
        terminalMethod: 'orderBy',
      },
      {
        table: lineOperatorsTable,
        rows: [],
        terminalMethod: 'from',
      },
      {
        table: publicHolidaysTable,
        rows: [],
        terminalMethod: 'from',
      },
      {
        table: lineDayFactsTable,
        rows: [],
        terminalMethod: 'where',
      },
    ]);

    await expect(
      getLineProfileDataFromDb(
        db,
        'missing-line',
        30,
        {},
        DateTime.fromISO('2026-07-02T12:00:00+08:00'),
      ),
    ).rejects.toMatchObject({
      status: 404,
      statusText: 'Not Found',
    });

    expect(select).toHaveBeenCalledTimes(4);
    expect(calls).toEqual([
      {
        selectionKeys: [
          'id',
          'name',
          'type',
          'color',
          'started_at',
          'operating_hours',
        ],
        table: linesTable,
        whereCalls: 0,
        orderByCalls: 1,
        groupByCalls: 0,
      },
      {
        selectionKeys: ['line_id', 'operator_id', 'started_at', 'ended_at'],
        table: lineOperatorsTable,
        whereCalls: 0,
        orderByCalls: 0,
        groupByCalls: 0,
      },
      {
        selectionKeys: ['date'],
        table: publicHolidaysTable,
        whereCalls: 0,
        orderByCalls: 0,
        groupByCalls: 0,
      },
      {
        selectionKeys: [
          'date',
          'line_id',
          'service_seconds',
          'downtime_disruption_seconds',
          'downtime_maintenance_seconds',
          'downtime_infra_seconds',
          'issue_count_disruption',
          'issue_count_maintenance',
          'issue_count_infra',
        ],
        table: lineDayFactsTable,
        whereCalls: 1,
        orderByCalls: 0,
        groupByCalls: 0,
      },
    ]);
  });
});
