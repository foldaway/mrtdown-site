import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { Issue, Line, Station } from '~/types';
import {
  buildLineSummary,
  parseStatisticsSnapshotPayload,
  selectIncludedEntities,
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
