import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDb } from '~/db';
import {
  impactEventPeriodsTable,
  impactEventsTable,
  issuesTable,
  lineDayFactsTable,
  linesTable,
  operatorsTable,
  stationsTable,
} from '~/db/schema';
import { getSitemapDataFromDb } from './sitemap';
import { createDbStub } from './testDbStub';

describe('getSitemapDataFromDb', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T04:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('builds sitemap data from compact route-shaped queries', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { calls, db, select } = createDbStub<AppDb>([
      {
        table: linesTable,
        rows: [{ id: 'BPLRT' }, { id: 'EWL' }],
        terminalMethod: 'orderBy',
      },
      {
        table: stationsTable,
        rows: [{ id: 'BP1' }, { id: 'EW1' }],
        terminalMethod: 'orderBy',
      },
      {
        table: operatorsTable,
        rows: [{ id: 'SBST' }, { id: 'SMRT' }],
        terminalMethod: 'orderBy',
      },
      {
        table: issuesTable,
        rows: [
          { id: 'issue-1' },
          { id: 'issue-2' },
          { id: 'issue-3' },
          { id: 'issue-invalid' },
        ],
        terminalMethod: 'orderBy',
      },
      {
        table: impactEventsTable,
        rows: [
          {
            id: 'issue-1-periods-old',
            issue_id: 'issue-1',
            ts: '2026-01-01T00:00:00+08:00',
          },
          {
            id: 'issue-1-periods-new',
            issue_id: 'issue-1',
            ts: '2026-02-01T00:00:00+08:00',
          },
          {
            id: 'issue-2-periods',
            issue_id: 'issue-2',
            ts: '2026-03-01T00:00:00+08:00',
          },
          {
            id: 'issue-invalid-periods',
            issue_id: 'issue-invalid',
            ts: '2026-04-01T00:00:00+08:00',
          },
        ],
        terminalMethod: 'where',
      },
      {
        table: impactEventPeriodsTable,
        rows: [
          {
            impact_event_id: 'issue-1-periods-old',
            index: 0,
            start_at: '2026-01-15T00:00:00+08:00',
          },
          {
            impact_event_id: 'issue-1-periods-new',
            index: 1,
            start_at: '2026-05-10T00:00:00+08:00',
          },
          {
            impact_event_id: 'issue-1-periods-new',
            index: 0,
            start_at: '2026-04-20T00:00:00+08:00',
          },
          {
            impact_event_id: 'issue-2-periods',
            index: 0,
            start_at: '2026-06-05T00:00:00+08:00',
          },
          {
            impact_event_id: 'issue-invalid-periods',
            index: 0,
            start_at: 'not-a-date',
          },
        ],
        terminalMethod: 'where',
      },
      {
        table: lineDayFactsTable,
        selectionKeys: ['date'],
        rows: [{ date: '2026-04-20' }, { date: '2026-06-05' }],
        terminalMethod: 'groupBy',
      },
      {
        table: lineDayFactsTable,
        selectionKeys: ['startDate'],
        rows: [{ startDate: '2026-04-01' }],
        terminalMethod: 'from',
      },
    ]);

    await expect(getSitemapDataFromDb(db)).resolves.toEqual({
      lineIds: ['BPLRT', 'EWL'],
      stationIds: ['BP1', 'EW1'],
      operatorIds: ['SBST', 'SMRT'],
      issueIds: ['issue-1', 'issue-2'],
      monthEarliest: '2026-04-01',
      monthLatest: '2026-06-01',
      operationalFactCoverageDates: ['2026-04-20', '2026-06-05'],
      operationalFactCoverageMissing: false,
      operationalFactCoverageStartDate: '2026-04-01',
      currentDate: '2026-07-02',
    });

    expect(warn).toHaveBeenCalledWith(
      '[SITEMAP] Skipped issues with invalid first interval dates',
      {
        count: 1,
        issueIds: ['issue-invalid'],
      },
    );
    expect(select).toHaveBeenCalledTimes(8);
    expect(calls).toEqual([
      {
        selectionKeys: ['id'],
        table: linesTable,
        whereCalls: 0,
        orderByCalls: 1,
        groupByCalls: 0,
      },
      {
        selectionKeys: ['id'],
        table: stationsTable,
        whereCalls: 0,
        orderByCalls: 1,
        groupByCalls: 0,
      },
      {
        selectionKeys: ['id'],
        table: operatorsTable,
        whereCalls: 0,
        orderByCalls: 1,
        groupByCalls: 0,
      },
      {
        selectionKeys: ['id'],
        table: issuesTable,
        whereCalls: 0,
        orderByCalls: 1,
        groupByCalls: 0,
      },
      {
        selectionKeys: ['id', 'issue_id', 'ts'],
        table: impactEventsTable,
        whereCalls: 1,
        orderByCalls: 0,
        groupByCalls: 0,
      },
      {
        selectionKeys: ['impact_event_id', 'index', 'start_at'],
        table: impactEventPeriodsTable,
        whereCalls: 1,
        orderByCalls: 0,
        groupByCalls: 0,
      },
      {
        selectionKeys: ['date'],
        table: lineDayFactsTable,
        whereCalls: 1,
        orderByCalls: 0,
        groupByCalls: 1,
      },
      {
        selectionKeys: ['startDate'],
        table: lineDayFactsTable,
        whereCalls: 0,
        orderByCalls: 0,
        groupByCalls: 0,
      },
    ]);
  });
});
