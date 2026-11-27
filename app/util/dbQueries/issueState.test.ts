import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  deriveServiceScopeStationIds,
  deriveServiceScopeStationStretches,
  selectIssueScopeSnapshot,
  selectLatestServiceEvents,
  selectOperationalScopeInterval,
  selectServiceBranchSourceEvents,
} from './issueState';

describe('selectOperationalScopeInterval', () => {
  it('uses the active occurrence before a later planned occurrence', () => {
    const active = {
      startAt: '2026-11-18T10:00:00+08:00',
      endAt: '2026-11-18T14:00:00+08:00',
      status: 'ongoing' as const,
    };
    const future = {
      startAt: '2026-11-19T10:00:00+08:00',
      endAt: '2026-11-19T14:00:00+08:00',
      status: 'future' as const,
    };
    expect(selectOperationalScopeInterval([active, future])).toBe(active);
    expect(selectOperationalScopeInterval([future])).toBeUndefined();
  });
});

describe('selectIssueScopeSnapshot', () => {
  const now = DateTime.fromISO('2025-05-01T00:00:00+08:00');

  it('excludes a whole-service update at the end of the April 2025 occurrence', () => {
    const snapshot = selectIssueScopeSnapshot(
      [
        { ts: '2025-04-23T07:20:51+08:00', scope: 'segment' },
        { ts: '2025-04-23T09:00:51+08:00', scope: 'whole' },
      ],
      {
        startAt: '2025-04-23T07:00:00+08:00',
        endAt: '2025-04-23T09:00:51+08:00',
      },
      now,
    );
    expect(snapshot.events.map((event) => event.scope)).toEqual(['segment']);
    expect(snapshot.referenceAt).toBe('2025-04-23T09:00:50.999+08:00');
  });

  it('uses planned service topology but only already known events for a future occurrence', () => {
    const snapshot = selectIssueScopeSnapshot(
      [
        { ts: '2025-04-01T00:00:00+08:00' },
        { ts: '2025-05-02T00:00:00+08:00' },
      ],
      {
        startAt: '2025-05-10T08:00:00+08:00',
        endAt: '2025-05-10T10:00:00+08:00',
      },
      now,
    );
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.referenceAt).toBe('2025-05-10T08:00:00.000+08:00');
  });
});

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

describe('deriveServiceScopeStationStretches', () => {
  const path = ['A', 'B', 'C', 'D', 'E', 'F'];

  it('keeps disjoint stretches separate and merges touching scopes', () => {
    expect(
      deriveServiceScopeStationStretches(path, [
        {
          type: 'service.segment',
          station_id: null,
          from_station_id: 'A',
          to_station_id: 'B',
        },
        {
          type: 'service.point',
          station_id: 'C',
          from_station_id: null,
          to_station_id: null,
        },
        {
          type: 'service.segment',
          station_id: null,
          from_station_id: 'E',
          to_station_id: 'F',
        },
      ]),
    ).toEqual([
      ['A', 'B', 'C'],
      ['E', 'F'],
    ]);
  });

  it('does not substitute a whole path for an unresolvable scope', () => {
    expect(
      deriveServiceScopeStationStretches(path, [
        {
          type: 'service.segment',
          station_id: null,
          from_station_id: 'X',
          to_station_id: 'Y',
        },
      ]),
    ).toEqual([]);
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

    expect([
      ...selectLatestServiceEvents(
        events,
        references,
        'issue-1',
        'service_scopes.set',
      ),
    ]).toEqual([
      ['northbound', expect.objectContaining({ id: 'north-latest' })],
      ['southbound', expect.objectContaining({ id: 'south-latest' })],
    ]);
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
      ).get('northbound')?.id,
    ).toBe('scope-b');
  });

  it('keeps an older shared event only for services without a newer update', () => {
    const events = [
      {
        id: 'shared',
        issue_id: 'issue-1',
        type: 'service_scopes.set',
        ts: '2025-01-01T00:00:00+08:00',
      },
      {
        id: 'north-new',
        issue_id: 'issue-1',
        type: 'service_scopes.set',
        ts: '2025-01-02T00:00:00+08:00',
      },
    ] as const;
    const selected = selectLatestServiceEvents(
      events,
      [
        { impact_event_id: 'shared', service_id: 'northbound' },
        { impact_event_id: 'shared', service_id: 'southbound' },
        { impact_event_id: 'north-new', service_id: 'northbound' },
      ],
      'issue-1',
      'service_scopes.set',
    );

    expect(selected.get('northbound')?.id).toBe('north-new');
    expect(selected.get('southbound')?.id).toBe('shared');
  });
});
