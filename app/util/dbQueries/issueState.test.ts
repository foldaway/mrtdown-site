import { describe, expect, it } from 'vitest';
import {
  deriveServiceScopeStationIds,
  selectLatestServiceEvents,
  selectServiceBranchSourceEvents,
} from './issueState';

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

  it('returns the reference revision path for whole-service scopes', () => {
    expect(
      deriveServiceScopeStationIds(
        BRANCH_STATION_IDS,
        [
          {
            type: 'service.whole',
            station_id: null,
            from_station_id: null,
            to_station_id: null,
          },
        ],
        ['NS1', 'NS2', 'NS3'],
      ),
    ).toEqual(['NS1', 'NS2', 'NS3']);
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

describe('selectLatestServiceEvents', () => {
  it('keeps the latest state independently for every affected service', () => {
    const events = [
      {
        id: 'north-old',
        issue_id: 'issue-1',
        type: 'service_scopes.set',
        ts: '2025-01-01T00:00:00+08:00',
      },
      {
        id: 'south-latest',
        issue_id: 'issue-1',
        type: 'service_scopes.set',
        ts: '2025-01-03T00:00:00+08:00',
      },
      {
        id: 'north-latest',
        issue_id: 'issue-1',
        type: 'service_scopes.set',
        ts: '2025-01-02T00:00:00+08:00',
      },
      {
        id: 'other-issue',
        issue_id: 'issue-2',
        type: 'service_scopes.set',
        ts: '2025-01-04T00:00:00+08:00',
      },
    ] as const;
    const references = [
      { impact_event_id: 'north-old', service_id: 'northbound' },
      { impact_event_id: 'south-latest', service_id: 'southbound' },
      { impact_event_id: 'north-latest', service_id: 'northbound' },
      { impact_event_id: 'other-issue', service_id: 'northbound' },
    ];

    expect(
      selectLatestServiceEvents(
        events,
        references,
        'issue-1',
        'service_scopes.set',
      ).map((event) => event.id),
    ).toEqual(['north-latest', 'south-latest']);
  });

  it('uses event ids as a deterministic timestamp tie-breaker per service', () => {
    const events = [
      {
        id: 'scope-a',
        issue_id: 'issue-1',
        type: 'service_scopes.set',
        ts: '2025-01-01T00:00:00+08:00',
      },
      {
        id: 'scope-b',
        issue_id: 'issue-1',
        type: 'service_scopes.set',
        ts: '2025-01-01T00:00:00+08:00',
      },
    ] as const;

    expect(
      selectLatestServiceEvents(
        events,
        events.map((event) => ({
          impact_event_id: event.id,
          service_id: 'northbound',
        })),
        'issue-1',
        'service_scopes.set',
      ).map((event) => event.id),
    ).toEqual(['scope-b']);
  });
});
