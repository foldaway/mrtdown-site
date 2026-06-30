import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { Issue, Line, Station } from '~/types';
import {
  buildLineSummary,
  deriveServiceScopeStationIds,
  isMissingTableError,
  parseStatisticsSnapshotPayload,
  selectIncludedEntities,
  selectLegacyHistoryFallback,
  selectServiceBranchSourceEvents,
  type SystemAnalytics,
} from './db.queries';

const REFERENCE_NOW = DateTime.fromISO('2026-02-23T23:59:00', {
  zone: 'Asia/Singapore',
});

const TEST_LINE: Line = {
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

const TEST_FEEDER_LINE: Line = {
  id: 'DTL',
  name: {
    'en-SG': 'Downtown Line',
    'zh-Hans': null,
    ms: null,
    ta: null,
  },
  type: 'mrt.high',
  color: '#005ec4',
  startedAt: '2015-12-27',
  operatingHours: {
    weekdays: { start: '05:30', end: '23:30' },
    weekends: { start: '05:30', end: '23:30' },
  },
  operators: [],
};

const TEST_STATION: Station = {
  id: 'BP6',
  name: {
    'en-SG': 'Bukit Panjang',
    'zh-Hans': null,
    ms: null,
    ta: null,
  },
  geo: {
    latitude: 1.379,
    longitude: 103.761,
  },
  townId: 'bukit-panjang',
  landmarkIds: [],
  memberships: [
    {
      branchId: TEST_LINE.id,
      code: 'BP6',
      lineId: TEST_LINE.id,
      sequenceOrder: 6,
      startedAt: '1999-11-06',
      structureType: 'elevated',
    },
    {
      branchId: TEST_FEEDER_LINE.id,
      code: 'DT1',
      lineId: TEST_FEEDER_LINE.id,
      sequenceOrder: 1,
      startedAt: '2015-12-27',
      structureType: 'underground',
    },
  ],
};

function buildIssue(
  id: string,
  type: Issue['type'],
  intervals: Issue['intervals'],
) {
  return {
    id,
    title: {
      'en-SG': id,
      'zh-Hans': null,
      ms: null,
      ta: null,
    },
    type,
    subtypes: [],
    durationSeconds: 0,
    lineIds: [TEST_LINE.id],
    branchesAffected: [],
    intervals,
    serviceEffectKinds: [],
    facilityEffectKinds: [],
  } as Parameters<typeof buildLineSummary>[1][number];
}

function buildStatistics(): SystemAnalytics {
  return {
    timeScaleChartsIssueCount: [],
    timeScaleChartsIssueDuration: [],
    chartTotalIssueCountByLine: {
      title: 'Issue Count by Line',
      data: [],
    },
    chartTotalIssueCountByStation: {
      title: 'Issue Count by Station',
      data: [],
    },
    chartRollingYearHeatmap: {
      title: 'Rolling Year Heatmap',
      data: [],
    },
    issueIdsDisruptionLongest: ['disruption-1'],
  };
}

describe('deriveServiceScopeStationIds', () => {
  const BRANCH_STATION_IDS = ['NS1', 'NS2', 'NS3', 'NS4', 'NS5'];

  it('returns the whole branch when no service scope is present', () => {
    expect(deriveServiceScopeStationIds(BRANCH_STATION_IDS, [])).toEqual(
      BRANCH_STATION_IDS,
    );
  });

  it('returns the whole branch for whole-service scopes', () => {
    expect(
      deriveServiceScopeStationIds(BRANCH_STATION_IDS, [
        {
          type: 'service.whole',
          station_id: null,
          from_station_id: null,
          to_station_id: null,
        },
      ]),
    ).toEqual(BRANCH_STATION_IDS);
  });

  it('returns the inclusive station range for segment scopes', () => {
    expect(
      deriveServiceScopeStationIds(BRANCH_STATION_IDS, [
        {
          type: 'service.segment',
          station_id: null,
          from_station_id: 'NS2',
          to_station_id: 'NS4',
        },
      ]),
    ).toEqual(['NS2', 'NS3', 'NS4']);
  });

  it('preserves branch order for reversed segment endpoints', () => {
    expect(
      deriveServiceScopeStationIds(BRANCH_STATION_IDS, [
        {
          type: 'service.segment',
          station_id: null,
          from_station_id: 'NS4',
          to_station_id: 'NS2',
        },
      ]),
    ).toEqual(['NS2', 'NS3', 'NS4']);
  });

  it('combines point and segment scopes in branch order', () => {
    expect(
      deriveServiceScopeStationIds(BRANCH_STATION_IDS, [
        {
          type: 'service.point',
          station_id: 'NS5',
          from_station_id: null,
          to_station_id: null,
        },
        {
          type: 'service.segment',
          station_id: null,
          from_station_id: 'NS2',
          to_station_id: 'NS3',
        },
      ]),
    ).toEqual(['NS2', 'NS3', 'NS5']);
  });

  it('falls back to the whole branch when scoped stations cannot be resolved', () => {
    expect(
      deriveServiceScopeStationIds(BRANCH_STATION_IDS, [
        {
          type: 'service.segment',
          station_id: null,
          from_station_id: 'EW1',
          to_station_id: 'EW2',
        },
      ]),
    ).toEqual(BRANCH_STATION_IDS);
  });
});

describe('selectServiceBranchSourceEvents', () => {
  it('uses service scope events as the source of affected branch pills', () => {
    const events = [
      { id: 'periods', type: 'periods.set' },
      { id: 'causes', type: 'causes.set' },
      { id: 'scopes', type: 'service_scopes.set' },
      { id: 'effects', type: 'service_effects.set' },
    ] as const;

    expect(selectServiceBranchSourceEvents(events)).toEqual([
      { id: 'scopes', type: 'service_scopes.set' },
    ]);
  });

  it('falls back to all state events for legacy issues without service scopes', () => {
    const events = [
      { id: 'periods', type: 'periods.set' },
      { id: 'effects', type: 'service_effects.set' },
    ] as const;

    expect(selectServiceBranchSourceEvents(events)).toEqual(events);
  });
});

describe('buildLineSummary', () => {
  it('merges overlapping same-type issue durations in daily breakdowns', () => {
    const summary = buildLineSummary(
      TEST_LINE,
      [
        buildIssue('infra-1', 'infra', [
          {
            startAt: '2026-02-23T05:30:00+08:00',
            endAt: '2026-02-23T23:30:00+08:00',
            status: 'ended',
          },
        ]),
        buildIssue('infra-2', 'infra', [
          {
            startAt: '2026-02-23T05:30:00+08:00',
            endAt: '2026-02-23T23:30:00+08:00',
            status: 'ended',
          },
        ]),
      ],
      1,
      new Set(),
      REFERENCE_NOW,
    );

    expect(
      summary.breakdownByDates['2026-02-23'].breakdownByIssueTypes.infra
        ?.totalDurationSeconds,
    ).toBe(18 * 60 * 60);
  });

  it('merges overlapping disruption windows before calculating downtime', () => {
    const summary = buildLineSummary(
      TEST_LINE,
      [
        buildIssue('disruption-1', 'disruption', [
          {
            startAt: '2026-02-23T05:30:00+08:00',
            endAt: '2026-02-23T23:30:00+08:00',
            status: 'ended',
          },
        ]),
        buildIssue('disruption-2', 'disruption', [
          {
            startAt: '2026-02-23T12:00:00+08:00',
            endAt: '2026-02-23T23:30:00+08:00',
            status: 'ended',
          },
        ]),
      ],
      1,
      new Set(),
      REFERENCE_NOW,
    );

    expect(summary.totalServiceSeconds).toBe(18 * 60 * 60);
    expect(summary.totalDowntimeSeconds).toBe(18 * 60 * 60);
    expect(summary.durationSecondsByIssueType.disruption).toBe(18 * 60 * 60);
    expect(summary.uptimeRatio).toBe(0);
  });

  it('treats lines as operating during service windows that spill into the next day', () => {
    const summary = buildLineSummary(
      {
        ...TEST_LINE,
        operatingHours: {
          weekdays: { start: '05:30', end: '00:30' },
          weekends: { start: '05:30', end: '00:30' },
        },
      },
      [],
      1,
      new Set(),
      DateTime.fromISO('2026-02-24T00:15:00', {
        zone: 'Asia/Singapore',
      }),
    );

    expect(summary.status).toBe('normal');
  });

  it('treats lines as closed after a next-day spillover service window ends', () => {
    const summary = buildLineSummary(
      {
        ...TEST_LINE,
        operatingHours: {
          weekdays: { start: '05:30', end: '00:30' },
          weekends: { start: '05:30', end: '00:30' },
        },
      },
      [],
      1,
      new Set(),
      DateTime.fromISO('2026-02-24T00:31:00', {
        zone: 'Asia/Singapore',
      }),
    );

    expect(summary.status).toBe('closed_for_day');
  });

  it('does not apply previous-day spillover before a line starts service', () => {
    const summary = buildLineSummary(
      {
        ...TEST_LINE,
        startedAt: '2026-02-24',
        operatingHours: {
          weekdays: { start: '05:30', end: '00:30' },
          weekends: { start: '05:30', end: '00:30' },
        },
      },
      [],
      1,
      new Set(),
      DateTime.fromISO('2026-02-24T00:15:00', {
        zone: 'Asia/Singapore',
      }),
    );

    expect(summary.status).toBe('closed_for_day');
  });
});

describe('parseStatisticsSnapshotPayload', () => {
  it('reads precomputed statistics snapshots with included entities', () => {
    const statistics = buildStatistics();
    const included = {
      issues: {},
      lines: {},
      stations: {},
      operators: {},
      towns: {},
      landmarks: {},
    };

    expect(
      parseStatisticsSnapshotPayload({
        kind: 'statistics_snapshot.v1',
        data: statistics,
        included,
      }),
    ).toEqual({
      data: statistics,
      included,
    });
  });

  it('keeps legacy statistics-only snapshots as a fallback', () => {
    const statistics = buildStatistics();

    expect(parseStatisticsSnapshotPayload(statistics)).toEqual({
      data: statistics,
      included: null,
    });
  });

  it('rejects malformed statistics snapshot payloads', () => {
    expect(
      parseStatisticsSnapshotPayload({
        kind: 'statistics_snapshot.v1',
        data: buildStatistics(),
      }),
    ).toBeNull();
    expect(parseStatisticsSnapshotPayload({})).toBeNull();
  });
});

describe('isMissingTableError', () => {
  it('recognizes Postgres undefined-table errors', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true);
  });

  it('recognizes D1 missing-table errors', () => {
    expect(
      isMissingTableError(
        new Error(
          'D1_ERROR: no such table: statistics_snapshots: SQLITE_ERROR',
        ),
      ),
    ).toBe(true);
  });

  it('recognizes wrapped SQLite missing-table causes', () => {
    expect(
      isMissingTableError(
        new Error('Failed query', {
          cause: {
            code: 'SQLITE_ERROR',
            message: 'no such table: line_day_facts',
          },
        }),
      ),
    ).toBe(true);
  });

  it('ignores unrelated database errors', () => {
    expect(
      isMissingTableError({
        code: 'SQLITE_CONSTRAINT',
        message: 'FOREIGN KEY constraint failed',
      }),
    ).toBe(false);
  });
});

describe('selectLegacyHistoryFallback', () => {
  const TODAY = DateTime.fromISO('2026-06-25T00:00:00+08:00');
  const PAST_START = DateTime.fromISO('2026-05-01T00:00:00+08:00');
  const PAST_END = DateTime.fromISO('2026-05-31T00:00:00+08:00');

  it('uses the legacy fallback when operational fact tables are absent', () => {
    expect(
      selectLegacyHistoryFallback(
        PAST_START,
        PAST_END,
        TODAY,
        [],
        { status: 'missing_table' },
        'history month 2026-05',
      ),
    ).toBe(true);
  });

  it('uses the legacy fallback when operational fact tables are empty', () => {
    expect(
      selectLegacyHistoryFallback(
        PAST_START,
        PAST_END,
        TODAY,
        [],
        { status: 'missing_table' },
        'history month 2026-05',
      ),
    ).toBe(true);
  });
});

describe('selectIncludedEntities', () => {
  it('keeps only explicitly needed entities plus issue branch dependencies', () => {
    const issue = buildIssue('disruption-1', 'disruption', [
      {
        startAt: '2026-02-23T05:30:00+08:00',
        endAt: '2026-02-23T06:30:00+08:00',
        status: 'ended',
      },
    ]);
    issue.branchesAffected = [
      {
        lineId: TEST_LINE.id,
        branchId: TEST_LINE.id,
        stationIds: [TEST_STATION.id],
      },
    ];

    const included = selectIncludedEntities(
      {
        lines: {
          [TEST_LINE.id]: TEST_LINE,
          [TEST_FEEDER_LINE.id]: TEST_FEEDER_LINE,
        },
        stations: {
          [TEST_STATION.id]: TEST_STATION,
        },
        operators: {
          SMRT: {
            id: 'SMRT',
            name: {
              'en-SG': 'SMRT',
              'zh-Hans': null,
              ms: null,
              ta: null,
            },
            foundedAt: '1987-08-06',
            url: null,
          },
        },
        towns: {
          'bukit-panjang': {
            id: 'bukit-panjang',
            name: {
              'en-SG': 'Bukit Panjang',
              'zh-Hans': null,
              ms: null,
              ta: null,
            },
          },
        },
        landmarks: {},
      },
      { [issue.id]: issue },
      {
        issueIds: [issue.id],
        includeStationMembershipLines: true,
      },
    );

    expect(Object.keys(included.issues)).toEqual([issue.id]);
    expect(Object.keys(included.stations)).toEqual([TEST_STATION.id]);
    expect(Object.keys(included.lines).sort()).toEqual(
      [TEST_FEEDER_LINE.id, TEST_LINE.id].sort(),
    );
    expect(included.operators).toEqual({});
    expect(included.towns).toEqual({});
    expect(included.landmarks).toEqual({});
    expect(included.issues[issue.id]).not.toHaveProperty('serviceEffectKinds');
    expect(included.issues[issue.id]).not.toHaveProperty('facilityEffectKinds');
  });

  it('keeps explicitly requested lines when no selected issue references them', () => {
    const included = selectIncludedEntities(
      {
        lines: {
          [TEST_LINE.id]: TEST_LINE,
          [TEST_FEEDER_LINE.id]: TEST_FEEDER_LINE,
        },
        stations: {
          [TEST_STATION.id]: TEST_STATION,
        },
        operators: {},
        towns: {},
        landmarks: {},
      },
      {},
      {
        issueIds: [],
        lineIds: [TEST_LINE.id],
      },
    );

    expect(Object.keys(included.lines)).toEqual([TEST_LINE.id]);
    expect(included.issues).toEqual({});
    expect(included.stations).toEqual({});
  });

  it('keeps explicitly requested stations and their membership lines', () => {
    const station = {
      ...TEST_STATION,
      landmarkIds: ['hillion'],
    };
    const included = selectIncludedEntities(
      {
        lines: {
          [TEST_LINE.id]: TEST_LINE,
          [TEST_FEEDER_LINE.id]: TEST_FEEDER_LINE,
        },
        stations: {
          [station.id]: station,
        },
        operators: {},
        towns: {
          'bukit-panjang': {
            id: 'bukit-panjang',
            name: {
              'en-SG': 'Bukit Panjang',
              'zh-Hans': null,
              ms: null,
              ta: null,
            },
          },
        },
        landmarks: {
          hillion: {
            id: 'hillion',
            name: {
              'en-SG': 'Hillion Mall',
              'zh-Hans': null,
              ms: null,
              ta: null,
            },
          },
        },
      },
      {},
      {
        issueIds: [],
        stationIds: [station.id],
        includeStationDetailEntities: true,
        includeStationMembershipLines: true,
      },
    );

    expect(Object.keys(included.stations)).toEqual([station.id]);
    expect(Object.keys(included.lines).sort()).toEqual(
      [TEST_FEEDER_LINE.id, TEST_LINE.id].sort(),
    );
    expect(Object.keys(included.towns)).toEqual(['bukit-panjang']);
    expect(Object.keys(included.landmarks)).toEqual(['hillion']);
    expect(included.issues).toEqual({});
  });

  it('keeps operators for requested lines when requested', () => {
    const line = {
      ...TEST_LINE,
      operators: [
        {
          operatorId: 'SMRT',
          startedAt: '1999-11-06',
          endedAt: null,
        },
      ],
    };
    const included = selectIncludedEntities(
      {
        lines: {
          [line.id]: line,
        },
        stations: {},
        operators: {
          SMRT: {
            id: 'SMRT',
            name: {
              'en-SG': 'SMRT',
              'zh-Hans': null,
              ms: null,
              ta: null,
            },
            foundedAt: '1987-08-06',
            url: null,
          },
        },
        towns: {},
        landmarks: {},
      },
      {},
      {
        issueIds: [],
        lineIds: [line.id],
        includeLineOperators: true,
      },
    );

    expect(Object.keys(included.lines)).toEqual([line.id]);
    expect(Object.keys(included.operators)).toEqual(['SMRT']);
  });
});
