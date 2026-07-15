import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { Issue, Line, Station } from '~/types';
import {
  buildLineOperationalFactRows,
  buildLineSummary,
  deriveServiceScopeStationIds,
  deriveTownMapReferenceDate,
  deriveTownStationStatus,
  deriveTownStatus,
  getTownLineIds,
  getTownRecentIssueWindow,
  parseStatisticsSnapshotPayload,
  resolveStationMembershipEndedAt,
  resolveStationProfileStationId,
  type SystemAnalytics,
  selectIncludedEntities,
  selectRecentTownIssueIds,
  selectServiceBranchSourceEvents,
} from './db.queries';

describe('resolveStationMembershipEndedAt', () => {
  it('exposes an end date on its exclusive boundary', () => {
    expect(resolveStationMembershipEndedAt('2026-07-12', '2026-07-12')).toBe(
      '2026-07-12',
    );
  });

  it('does not expose a future end date as a closure', () => {
    expect(
      resolveStationMembershipEndedAt('2026-07-13', '2026-07-12'),
    ).toBeUndefined();
  });
});

const REFERENCE_NOW = DateTime.fromISO('2026-02-23T23:59:00', {
  zone: 'Asia/Singapore',
});

function toIso(value: DateTime) {
  const result = value.toISO();
  if (result == null) {
    throw new Error('Expected a valid ISO timestamp');
  }
  return result;
}

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

describe('town profile helpers', () => {
  it('distinguishes future, closed and active station memberships', () => {
    const membership = TEST_STATION.memberships[0];

    expect(
      deriveTownStationStatus(
        [{ ...membership, startedAt: '2027-01-01' }],
        [],
        new Set(),
        REFERENCE_NOW,
      ),
    ).toBe('future_service');
    expect(
      deriveTownStationStatus(
        [{ ...membership, endedAt: '2025-01-01' }],
        [],
        new Set(),
        REFERENCE_NOW,
      ),
    ).toBe('not_in_service');
    expect(
      deriveTownStationStatus(
        [membership],
        ['disruption'],
        new Set(),
        REFERENCE_NOW,
      ),
    ).toBe('ongoing_disruption');
  });

  it('distinguishes stations inside and outside line operating hours', () => {
    const membership = TEST_STATION.memberships[0];

    expect(
      deriveTownStationStatus(
        [membership],
        [],
        new Set([membership.lineId]),
        REFERENCE_NOW,
      ),
    ).toBe('normal');
    expect(
      deriveTownStationStatus([membership], [], new Set(), REFERENCE_NOW),
    ).toBe('closed_for_day');
  });

  it('marks a future-only town as future service', () => {
    expect(deriveTownStatus(['future_service', 'future_service'])).toBe(
      'future_service',
    );
  });

  it('chooses the first map snapshot where every future station has started', () => {
    const mapReferenceDate = deriveTownMapReferenceDate(
      [
        {
          memberships: [
            { ...TEST_STATION.memberships[0], startedAt: '2027-01-01' },
          ],
        },
        {
          memberships: [
            { ...TEST_STATION.memberships[1], startedAt: '2029-06-01' },
          ],
        },
      ],
      REFERENCE_NOW,
    );

    expect(mapReferenceDate.toISODate()).toBe('2029-12-01');
  });

  it('chooses a future map snapshot for mixed-service towns', () => {
    const mapReferenceDate = deriveTownMapReferenceDate(
      [
        { memberships: [TEST_STATION.memberships[0]] },
        {
          memberships: [
            { ...TEST_STATION.memberships[1], startedAt: '2029-06-01' },
          ],
        },
      ],
      REFERENCE_NOW,
    );

    expect(mapReferenceDate.toISODate()).toBe('2029-12-01');
  });

  it('rounds future station openings to the matching snapshot month', () => {
    const mapReferenceDate = deriveTownMapReferenceDate(
      [
        {
          memberships: [
            { ...TEST_STATION.memberships[0], startedAt: '2027-12-15' },
          ],
        },
      ],
      REFERENCE_NOW,
    );

    expect(mapReferenceDate.toISODate()).toBe('2027-12-01');
  });

  it('keeps active-only towns on the current map snapshot', () => {
    const mapReferenceDate = deriveTownMapReferenceDate(
      [{ memberships: TEST_STATION.memberships }],
      REFERENCE_NOW,
    );

    expect(mapReferenceDate).toBe(REFERENCE_NOW);
  });

  it('excludes ended memberships from town line IDs', () => {
    expect(
      getTownLineIds([
        {
          memberships: [
            TEST_STATION.memberships[0],
            { ...TEST_STATION.memberships[1], endedAt: '2025-01-01' },
          ],
        },
      ]),
    ).toEqual([TEST_LINE.id]);
  });

  it('filters recent town issues to the same 90-day display window', () => {
    const recentIssue = buildIssue('recent', 'disruption', [
      {
        startAt: toIso(REFERENCE_NOW.minus({ days: 10 })),
        endAt: toIso(REFERENCE_NOW.minus({ days: 9 })),
        status: 'ended',
      },
    ]);
    const oldIssue = buildIssue('old', 'maintenance', [
      {
        startAt: toIso(REFERENCE_NOW.minus({ days: 120 })),
        endAt: toIso(REFERENCE_NOW.minus({ days: 119 })),
        status: 'ended',
      },
    ]);
    const issuesById = {
      [recentIssue.id]: recentIssue,
      [oldIssue.id]: oldIssue,
    };

    expect(
      selectRecentTownIssueIds(
        [oldIssue, recentIssue],
        issuesById,
        REFERENCE_NOW,
      ),
    ).toEqual(['recent']);
    const window = getTownRecentIssueWindow(REFERENCE_NOW);
    expect(window.end.diff(window.start, 'days').days).toBe(90);
  });
});

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

describe('resolveStationProfileStationId', () => {
  it('keeps canonical station ids unchanged', () => {
    expect(
      resolveStationProfileStationId(
        { stations: { [TEST_STATION.id]: TEST_STATION } },
        TEST_STATION.id,
      ),
    ).toBe(TEST_STATION.id);
  });

  it('resolves station-code aliases to their canonical station id', () => {
    const station = {
      ...TEST_STATION,
      id: 'BKP',
    };

    expect(
      resolveStationProfileStationId(
        { stations: { [station.id]: station } },
        'BP6',
      ),
    ).toBe('BKP');
  });

  it('returns null for unknown station ids or codes', () => {
    expect(
      resolveStationProfileStationId(
        { stations: { [TEST_STATION.id]: TEST_STATION } },
        'NOPE',
      ),
    ).toBeNull();
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
    expect(
      summary.breakdownByDates['2026-02-23'].breakdownByIssueTypes.infra
        ?.intervals,
    ).toEqual([
      {
        startAt: '2026-02-23T05:30:00.000+08:00',
        endAt: '2026-02-23T23:30:00.000+08:00',
      },
    ]);
  });

  it('keeps different issue types in independent timeline intervals', () => {
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
        buildIssue('disruption-1', 'disruption', [
          {
            startAt: '2026-02-23T12:00:00+08:00',
            endAt: '2026-02-23T16:00:00+08:00',
            status: 'ended',
          },
        ]),
      ],
      1,
      new Set(),
      REFERENCE_NOW,
    );

    const day = summary.breakdownByDates['2026-02-23'];
    expect(day.breakdownByIssueTypes.infra?.intervals).toEqual([
      {
        startAt: '2026-02-23T05:30:00.000+08:00',
        endAt: '2026-02-23T23:30:00.000+08:00',
      },
    ]);
    expect(day.breakdownByIssueTypes.disruption?.intervals).toEqual([
      {
        startAt: '2026-02-23T12:00:00.000+08:00',
        endAt: '2026-02-23T16:00:00.000+08:00',
      },
    ]);
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

describe('buildLineOperationalFactRows', () => {
  it('stores each issue interval clipped to the line service window', () => {
    const facts = buildLineOperationalFactRows(
      TEST_LINE,
      [
        buildIssue('infra-1', 'infra', [
          {
            startAt: '2026-02-23T00:00:00+08:00',
            endAt: '2026-02-24T00:00:00+08:00',
            status: 'ended',
          },
        ]),
        buildIssue('disruption-1', 'disruption', [
          {
            startAt: '2026-02-23T12:00:00+08:00',
            endAt: '2026-02-23T16:00:00+08:00',
            status: 'ended',
          },
        ]),
      ],
      DateTime.fromISO('2026-02-23', { zone: 'Asia/Singapore' }),
      new Set(),
      REFERENCE_NOW,
    );

    expect(facts.intervalRows).toMatchObject([
      {
        date: '2026-02-23',
        line_id: 'BPLRT',
        issue_id: 'infra-1',
        interval_index: 0,
        issue_type: 'infra',
        start_at: '2026-02-23T05:30:00.000+08:00',
        end_at: '2026-02-23T23:30:00.000+08:00',
      },
      {
        date: '2026-02-23',
        line_id: 'BPLRT',
        issue_id: 'disruption-1',
        interval_index: 0,
        issue_type: 'disruption',
        start_at: '2026-02-23T12:00:00.000+08:00',
        end_at: '2026-02-23T16:00:00.000+08:00',
      },
    ]);
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
