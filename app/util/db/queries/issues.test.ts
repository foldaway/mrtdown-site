import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { AppDb } from '~/db';
import {
  evidencesTable,
  impactEventsTable,
  issuesTable,
  lineOperatorsTable,
  linesTable,
} from '~/db/schema';
import { getIssueDataFromDb } from './issues';
import { createDbStub } from './testDbStub';

describe('getIssueDataFromDb', () => {
  it('fails missing issues after scoped route-shaped reads', async () => {
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
        table: evidencesTable,
        selectionKeys: ['type', 'text', 'render', 'source_url', 'ts'],
        rows: [],
        terminalMethod: 'orderBy',
      },
      {
        table: issuesTable,
        rows: [],
        terminalMethod: 'where',
      },
      {
        table: impactEventsTable,
        rows: [],
        terminalMethod: 'where',
      },
      {
        table: evidencesTable,
        selectionKeys: ['issue_id', 'latest_ts'],
        rows: [],
        terminalMethod: 'groupBy',
      },
    ]);

    await expect(
      getIssueDataFromDb(
        db,
        'missing-issue',
        DateTime.fromISO('2026-07-02T12:00:00+08:00'),
      ),
    ).rejects.toMatchObject({
      status: 404,
      statusText: 'Not Found',
    });

    expect(select).toHaveBeenCalledTimes(6);
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
        selectionKeys: ['type', 'text', 'render', 'source_url', 'ts'],
        table: evidencesTable,
        whereCalls: 1,
        orderByCalls: 1,
        groupByCalls: 0,
      },
      {
        selectionKeys: ['id', 'title', 'type'],
        table: issuesTable,
        whereCalls: 1,
        orderByCalls: 0,
        groupByCalls: 0,
      },
      {
        selectionKeys: ['id', 'ts', 'issue_id', 'type'],
        table: impactEventsTable,
        whereCalls: 1,
        orderByCalls: 0,
        groupByCalls: 0,
      },
      {
        selectionKeys: ['issue_id', 'latest_ts'],
        table: evidencesTable,
        whereCalls: 1,
        orderByCalls: 0,
        groupByCalls: 1,
      },
    ]);
  });
});
