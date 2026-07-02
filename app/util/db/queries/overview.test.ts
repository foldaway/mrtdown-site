import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { AppDb } from '~/db';
import {
  evidencesTable,
  impactEventCausesTable,
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventFacilityEffectsTable,
  impactEventPeriodsTable,
  impactEventServiceEffectsTable,
  impactEventServiceScopesTable,
  impactEventsTable,
  issuesTable,
  lineDayFactsTable,
  lineOperatorsTable,
  linesTable,
  publicHolidaysTable,
  serviceRevisionPathStationEntriesTable,
  serviceRevisionsTable,
  servicesTable,
  stationCodesTable,
  stationsTable,
} from '~/db/schema';
import type { Line } from '~/types';
import {
  buildFactBackedLineSummaries,
  getOverviewDataFromDb,
} from './overview';
import { createDbStub } from './testDbStub';
import type { IssueWithOperationalEffects } from './types';

const singaporeDateTime = (value: string) =>
  DateTime.fromISO(value, { setZone: true });

describe('getOverviewDataFromDb', () => {
  it('builds home line summaries from compact line-day facts', async () => {
    const { calls, db, select } = createDbStub<AppDb>([
      {
        table: linesTable,
        rows: [
          {
            id: 'BPLRT',
            name: {
              'en-SG': 'Bukit Panjang LRT',
              'zh-Hans': null,
              ms: null,
              ta: null,
            },
            type: 'lrt',
            color: '#748274',
            started_at: '1999-11-06',
            operating_hours: {
              weekdays: { start: '05:30', end: '23:30' },
              weekends: { start: '05:30', end: '23:30' },
            },
          },
        ],
        terminalMethod: 'orderBy',
      },
      {
        table: lineOperatorsTable,
        rows: [
          {
            line_id: 'BPLRT',
            operator_id: 'SMRT',
            started_at: '1999-11-06',
            ended_at: null,
          },
        ],
        terminalMethod: 'from',
      },
      {
        table: publicHolidaysTable,
        rows: [{ date: '2026-07-01' }],
        terminalMethod: 'from',
      },
      {
        table: lineDayFactsTable,
        rows: [
          {
            date: '2026-07-01',
            line_id: 'BPLRT',
            service_seconds: 60,
            downtime_disruption_seconds: 10,
            downtime_maintenance_seconds: 0,
            downtime_infra_seconds: 0,
            issue_count_disruption: 1,
            issue_count_maintenance: 0,
            issue_count_infra: 0,
          },
          {
            date: '2026-07-02',
            line_id: 'BPLRT',
            service_seconds: 60,
            downtime_disruption_seconds: 0,
            downtime_maintenance_seconds: 15,
            downtime_infra_seconds: 0,
            issue_count_disruption: 0,
            issue_count_maintenance: 1,
            issue_count_infra: 0,
          },
        ],
        terminalMethod: 'where',
      },
      {
        table: impactEventPeriodsTable,
        rows: [],
        terminalMethod: 'where',
      },
    ]);

    const result = await getOverviewDataFromDb(
      db,
      2,
      {},
      singaporeDateTime('2026-07-02T12:00:00+08:00'),
    );

    expect(result.data.issueIdsActiveNow).toEqual([]);
    expect(result.data.issueIdsActiveToday).toEqual([]);
    expect(result.included.lines.BPLRT).toMatchObject({
      id: 'BPLRT',
      operators: [
        {
          operatorId: 'SMRT',
          startedAt: '1999-11-06',
          endedAt: null,
        },
      ],
    });
    expect(result.data.lineSummaries).toHaveLength(1);
    expect(result.data.lineSummaries[0]).toMatchObject({
      lineId: 'BPLRT',
      status: 'normal',
      totalServiceSeconds: 120,
      totalDowntimeSeconds: 25,
      uptimeRatio: 1 - 25 / 120,
      breakdownByDates: {
        '2026-07-01': {
          dayType: 'public_holiday',
          breakdownByIssueTypes: {
            disruption: {
              totalDurationSeconds: 10,
              issueIds: [],
            },
          },
        },
        '2026-07-02': {
          dayType: 'weekday',
          breakdownByIssueTypes: {
            maintenance: {
              totalDurationSeconds: 15,
              issueIds: [],
            },
          },
        },
      },
    });

    expect(select).toHaveBeenCalledTimes(5);
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
      {
        selectionKeys: ['impact_event_id'],
        table: impactEventPeriodsTable,
        whereCalls: 1,
        orderByCalls: 0,
        groupByCalls: 0,
      },
    ]);
  });

  it('hydrates overview issue cards with scoped issue queries', async () => {
    const referenceNow = singaporeDateTime('2026-07-02T08:05:00+08:00');
    const { calls, db } = createDbStub<AppDb>([
      {
        table: linesTable,
        rows: [
          {
            id: 'BPLRT',
            name: {
              'en-SG': 'Bukit Panjang LRT',
              'zh-Hans': null,
              ms: null,
              ta: null,
            },
            type: 'lrt',
            color: '#748274',
            started_at: '1999-11-06',
            operating_hours: {
              weekdays: { start: '05:30', end: '23:30' },
              weekends: { start: '05:30', end: '23:30' },
            },
          },
        ],
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
        rows: [
          {
            date: '2026-07-02',
            line_id: 'BPLRT',
            service_seconds: 60,
            downtime_disruption_seconds: 10,
            downtime_maintenance_seconds: 0,
            downtime_infra_seconds: 0,
            issue_count_disruption: 1,
            issue_count_maintenance: 0,
            issue_count_infra: 0,
          },
        ],
        terminalMethod: 'where',
      },
      {
        table: impactEventPeriodsTable,
        selectionKeys: ['impact_event_id'],
        rows: [{ impact_event_id: 'period-event' }],
        terminalMethod: 'where',
      },
      {
        table: impactEventsTable,
        selectionKeys: ['id', 'issue_id'],
        rows: [{ id: 'period-event', issue_id: 'issue-1' }],
        terminalMethod: 'where',
      },
      {
        table: impactEventsTable,
        selectionKeys: ['id', 'issue_id', 'ts'],
        rows: [
          {
            id: 'period-event',
            issue_id: 'issue-1',
            ts: '2026-07-02T08:00:00+08:00',
          },
        ],
        terminalMethod: 'where',
      },
      {
        table: issuesTable,
        rows: [
          {
            id: 'issue-1',
            type: 'disruption',
            title: {
              'en-SG': 'Signal fault',
              'zh-Hans': null,
              ms: null,
              ta: null,
            },
          },
        ],
        terminalMethod: 'where',
      },
      {
        table: impactEventsTable,
        selectionKeys: ['id', 'ts', 'issue_id', 'type'],
        rows: [
          {
            id: 'period-event',
            ts: '2026-07-02T08:00:00+08:00',
            issue_id: 'issue-1',
            type: 'periods.set',
          },
        ],
        terminalMethod: 'where',
      },
      {
        table: evidencesTable,
        rows: [],
        terminalMethod: 'groupBy',
      },
      {
        table: impactEventPeriodsTable,
        selectionKeys: ['impact_event_id', 'start_at', 'end_at'],
        rows: [
          {
            impact_event_id: 'period-event',
            start_at: '2026-07-02T08:00:00+08:00',
            end_at: '2026-07-02T08:10:00+08:00',
          },
        ],
        terminalMethod: 'where',
      },
      {
        table: impactEventEntityServicesTable,
        rows: [],
        terminalMethod: 'where',
      },
      {
        table: impactEventEntityFacilitiesTable,
        rows: [
          {
            impact_event_id: 'period-event',
            station_id: 'BP6',
            line_id: 'BPLRT',
          },
        ],
        terminalMethod: 'where',
      },
      {
        table: impactEventCausesTable,
        rows: [{ impact_event_id: 'period-event', type: 'track_fault' }],
        terminalMethod: 'where',
      },
      {
        table: impactEventServiceScopesTable,
        rows: [],
        terminalMethod: 'where',
      },
      {
        table: impactEventServiceEffectsTable,
        rows: [],
        terminalMethod: 'where',
      },
      {
        table: impactEventFacilityEffectsTable,
        rows: [],
        terminalMethod: 'where',
      },
      {
        table: stationsTable,
        rows: [
          {
            id: 'BP6',
            name: {
              'en-SG': 'Bukit Panjang',
              'zh-Hans': null,
              ms: null,
              ta: null,
            },
            townId: 'bukit-panjang',
            latitude: 1.379,
            longitude: 103.761,
          },
        ],
        terminalMethod: 'where',
      },
      {
        table: stationCodesTable,
        rows: [
          {
            station_id: 'BP6',
            line_id: 'BPLRT',
            code: 'BP6',
            started_at: '1999-11-06',
            ended_at: null,
            structure_type: 'elevated',
          },
        ],
        terminalMethod: 'where',
      },
    ]);

    const result = await getOverviewDataFromDb(db, 1, {}, referenceNow);

    expect(result.data.issueIdsActiveNow).toEqual(['issue-1']);
    expect(result.included.issues['issue-1']).toMatchObject({
      id: 'issue-1',
      lineIds: ['BPLRT'],
      branchesAffected: [
        {
          lineId: 'BPLRT',
          branchId: 'BPLRT:BP6',
          stationIds: ['BP6'],
        },
      ],
    });
    expect(result.included.stations.BP6).toMatchObject({
      id: 'BP6',
      memberships: [
        {
          lineId: 'BPLRT',
          code: 'BP6',
        },
      ],
    });
    expect(
      result.data.lineSummaries[0]?.breakdownByDates['2026-07-02']
        .breakdownByIssueTypes.disruption?.issueIds,
    ).toEqual(['issue-1']);
    expect(calls.map((call) => call.table)).not.toContain(servicesTable);
    expect(calls.map((call) => call.table)).not.toContain(
      serviceRevisionsTable,
    );
    expect(calls.map((call) => call.table)).not.toContain(
      serviceRevisionPathStationEntriesTable,
    );
  });

  it('keeps issue ids on fact-backed date cells for hover details', () => {
    const line: Line = {
      id: 'BPLRT',
      name: {
        'en-SG': 'Bukit Panjang LRT',
        'zh-Hans': null,
        ms: null,
        ta: null,
      },
      type: 'lrt',
      color: '#748274',
      startedAt: '1999-11-06',
      operatingHours: {
        weekdays: { start: '05:30', end: '23:30' },
        weekends: { start: '05:30', end: '23:30' },
      },
      operators: [],
    };
    const issue: IssueWithOperationalEffects = {
      id: 'issue-1',
      title: {
        'en-SG': 'Signal fault',
        'zh-Hans': null,
        ms: null,
        ta: null,
      },
      type: 'disruption',
      subtypes: [],
      durationSeconds: 600,
      lineIds: ['BPLRT'],
      branchesAffected: [
        {
          lineId: 'BPLRT',
          branchId: 'BPLRT',
          stationIds: ['BP1'],
        },
      ],
      intervals: [
        {
          startAt: '2026-07-02T08:00:00+08:00',
          endAt: '2026-07-02T08:10:00+08:00',
          status: 'ended',
        },
      ],
      serviceEffectKinds: [],
      facilityEffectKinds: [],
    };

    const summaries = buildFactBackedLineSummaries({
      days: 1,
      facts: [
        {
          date: '2026-07-02',
          line_id: 'BPLRT',
          service_seconds: 60,
          downtime_disruption_seconds: 10,
          downtime_maintenance_seconds: 0,
          downtime_infra_seconds: 0,
          issue_count_disruption: 1,
          issue_count_maintenance: 0,
          issue_count_infra: 0,
        },
      ] as Parameters<typeof buildFactBackedLineSummaries>[0]['facts'],
      lines: { BPLRT: line },
      publicHolidaySet: new Set(),
      issuesByLineId: {
        BPLRT: [issue],
      },
      referenceNow: singaporeDateTime('2026-07-02T12:00:00+08:00'),
    });

    expect(
      summaries[0]?.breakdownByDates['2026-07-02'].breakdownByIssueTypes
        .disruption?.issueIds,
    ).toEqual(['issue-1']);
  });

  it('bounds fact-backed hover details to the calendar day service allocation', () => {
    const line: Line = {
      id: 'BPLRT',
      name: {
        'en-SG': 'Bukit Panjang LRT',
        'zh-Hans': null,
        ms: null,
        ta: null,
      },
      type: 'lrt',
      color: '#748274',
      startedAt: '1999-11-06',
      operatingHours: {
        weekdays: { start: '05:38', end: '00:35' },
        weekends: { start: '05:38', end: '00:35' },
      },
      operators: [],
    };
    const issue: IssueWithOperationalEffects = {
      id: 'maintenance-1',
      title: {
        'en-SG': 'SKLRT System Upgrade - Service Adjustments',
        'zh-Hans': null,
        ms: null,
        ta: null,
      },
      type: 'maintenance',
      subtypes: [],
      durationSeconds: 1800,
      lineIds: ['BPLRT'],
      branchesAffected: [
        {
          lineId: 'BPLRT',
          branchId: 'BPLRT',
          stationIds: ['BP1'],
        },
      ],
      intervals: [
        {
          startAt: '2026-07-02T00:00:00+08:00',
          endAt: '2026-07-03T00:00:00+08:00',
          status: 'ended',
        },
      ],
      serviceEffectKinds: [],
      facilityEffectKinds: [],
    };

    const summaries = buildFactBackedLineSummaries({
      days: 1,
      facts: [
        {
          date: '2026-07-02',
          line_id: 'BPLRT',
          service_seconds: 18 * 60 * 60,
          downtime_disruption_seconds: 0,
          downtime_maintenance_seconds: 0,
          downtime_infra_seconds: 0,
          issue_count_disruption: 0,
          issue_count_maintenance: 1,
          issue_count_infra: 0,
        },
      ] as Parameters<typeof buildFactBackedLineSummaries>[0]['facts'],
      lines: { BPLRT: line },
      publicHolidaySet: new Set(),
      issuesByLineId: {
        BPLRT: [issue],
      },
      referenceNow: DateTime.fromISO('2026-07-02T12:00:00+08:00'),
    });

    expect(summaries[0]?.totalDowntimeSeconds).toBe(0);
    expect(
      summaries[0]?.breakdownByDates['2026-07-02'].breakdownByIssueTypes
        .maintenance,
    ).toMatchObject({
      totalDurationSeconds: 18 * 60 * 60 + 22 * 60,
      issueIds: ['maintenance-1'],
    });
  });

  it('does not create zero-duration hover breakdowns from issue counts', () => {
    const line: Line = {
      id: 'CCL',
      name: {
        'en-SG': 'Circle Line',
        'zh-Hans': null,
        ms: null,
        ta: null,
      },
      type: 'mrt.high',
      color: '#fa9e0d',
      startedAt: '2009-05-28',
      operatingHours: {
        weekdays: { start: '05:50', end: '23:59' },
        weekends: { start: '05:50', end: '23:59' },
      },
      operators: [],
    };

    const summaries = buildFactBackedLineSummaries({
      days: 1,
      facts: [
        {
          date: '2026-05-26',
          line_id: 'CCL',
          service_seconds: 18 * 60 * 60 + 9 * 60,
          downtime_disruption_seconds: 0,
          downtime_maintenance_seconds: 0,
          downtime_infra_seconds: 0,
          issue_count_disruption: 0,
          issue_count_maintenance: 1,
          issue_count_infra: 0,
        },
      ] as Parameters<typeof buildFactBackedLineSummaries>[0]['facts'],
      lines: { CCL: line },
      publicHolidaySet: new Set(),
      issuesByLineId: {},
      referenceNow: DateTime.fromISO('2026-05-26T12:00:00+08:00'),
    });

    expect(
      summaries[0]?.breakdownByDates['2026-05-26'].breakdownByIssueTypes,
    ).toEqual({});
  });
});
