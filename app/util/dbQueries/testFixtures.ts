import { DateTime } from 'luxon';
import type { Issue, Line, Station } from '~/types';
import type { buildLineSummary } from './lineAnalytics';
import type { SystemAnalytics } from './statistics';

export const REFERENCE_NOW = DateTime.fromISO('2026-02-23T23:59:00', {
  zone: 'Asia/Singapore',
});

export function toIso(value: DateTime) {
  const result = value.toISO();
  if (result == null) {
    throw new Error('Expected a valid ISO timestamp');
  }
  return result;
}

export const TEST_LINE: Line = {
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

export const TEST_FEEDER_LINE: Line = {
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

export const TEST_STATION: Station = {
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

export function buildIssue(
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

export function buildStatistics(): SystemAnalytics {
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
