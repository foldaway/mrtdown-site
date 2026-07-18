import { describe, expect, it } from 'vitest';
import {
  aggregateLineUptimeFacts,
  mergeLineReadModelScope,
  rankLineSummaryFromFacts,
} from './lines';

describe('line read-model scope', () => {
  it('merges the root, community, and issue graph without duplicates', () => {
    expect(
      mergeLineReadModelScope({
        lineId: 'NSL',
        lineServiceIds: ['nsl-main'],
        lineStationIds: ['NS1', 'NS2'],
        communityLineIds: ['NSL', 'TEL'],
        communityStationIds: ['NS2', 'TE2'],
        issueScope: {
          lineIds: ['NSL', 'EWL'],
          serviceIds: ['nsl-main', 'ewl-main'],
          stationIds: ['NS1', 'EW1'],
        },
      }),
    ).toEqual({
      lineIds: ['NSL', 'TEL', 'EWL'],
      serviceIds: ['nsl-main', 'ewl-main'],
      stationIds: ['NS1', 'NS2', 'TE2', 'EW1'],
    });
  });

  it('keeps a planned line without issues scoped to its static graph', () => {
    expect(
      mergeLineReadModelScope({
        lineId: 'JRL',
        lineServiceIds: ['jrl-main'],
        lineStationIds: ['JS1', 'JS2'],
        communityLineIds: [],
        communityStationIds: [],
        issueScope: { lineIds: [], serviceIds: [], stationIds: [] },
      }),
    ).toEqual({
      lineIds: ['JRL'],
      serviceIds: ['jrl-main'],
      stationIds: ['JS1', 'JS2'],
    });
  });
});

describe('line uptime ranking', () => {
  it('aggregates compact daily facts into directory uptime', () => {
    expect(
      aggregateLineUptimeFacts([
        {
          line_id: 'NSL',
          service_seconds: 100,
          downtime_disruption_seconds: 2,
          downtime_maintenance_seconds: 1,
          downtime_infra_seconds: 0,
        },
        {
          line_id: 'NSL',
          service_seconds: 100,
          downtime_disruption_seconds: 1,
          downtime_maintenance_seconds: 0,
          downtime_infra_seconds: 0,
        },
        {
          line_id: 'JRL',
          service_seconds: 0,
          downtime_disruption_seconds: 0,
          downtime_maintenance_seconds: 0,
          downtime_infra_seconds: 0,
        },
      ]),
    ).toEqual(
      new Map([
        [
          'NSL',
          {
            totalServiceSeconds: 200,
            totalDowntimeSeconds: 4,
            uptimeRatio: 0.98,
          },
        ],
        [
          'JRL',
          {
            totalServiceSeconds: null,
            totalDowntimeSeconds: null,
            uptimeRatio: null,
          },
        ],
      ]),
    );
  });

  it('ranks the live line summary against compact daily facts', () => {
    expect(
      rankLineSummaryFromFacts('NSL', 0.98, [
        {
          line_id: 'NSL',
          service_seconds: 100,
          downtime_disruption_seconds: 0,
          downtime_maintenance_seconds: 0,
          downtime_infra_seconds: 0,
        },
        {
          line_id: 'EWL',
          service_seconds: 100,
          downtime_disruption_seconds: 1,
          downtime_maintenance_seconds: 0,
          downtime_infra_seconds: 0,
        },
        {
          line_id: 'CCL',
          service_seconds: 100,
          downtime_disruption_seconds: 5,
          downtime_maintenance_seconds: 0,
          downtime_infra_seconds: 0,
        },
      ]),
    ).toEqual({ uptimeRank: 2, totalLines: 3 });
  });

  it('excludes planned lines without service time from the ranking', () => {
    expect(
      rankLineSummaryFromFacts('JRL', null, [
        {
          line_id: 'JRL',
          service_seconds: 0,
          downtime_disruption_seconds: 0,
          downtime_maintenance_seconds: 0,
          downtime_infra_seconds: 0,
        },
      ]),
    ).toEqual({ uptimeRank: null, totalLines: null });
  });

  it('keeps a current line rankable while facts are being backfilled', () => {
    expect(rankLineSummaryFromFacts('NSL', 0.98, [])).toEqual({
      uptimeRank: 1,
      totalLines: 1,
    });
  });
});
