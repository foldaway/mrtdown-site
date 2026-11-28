import { describe, expect, it } from 'vitest';
import { selectIncludedEntities } from './includedEntities';
import {
  buildIssue,
  TEST_FEEDER_LINE,
  TEST_LINE,
  TEST_STATION,
} from './testFixtures';

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
