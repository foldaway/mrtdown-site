import { describe, expect, it } from 'vitest';
import {
  buildIssue,
  REFERENCE_NOW,
  TEST_LINE,
  TEST_STATION,
  toIso,
} from './testFixtures';
import {
  deriveTownMapReferenceDate,
  deriveTownStationStatus,
  deriveTownStatus,
  getTownLineIds,
  getTownRecentIssueWindow,
  mergeTownReadModelScope,
  selectRecentTownIssueIds,
} from './towns';

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

describe('town read-model scope', () => {
  it('merges the town stations and lines with the affected issue graph', () => {
    expect(
      mergeTownReadModelScope({
        townLineIds: ['NSL', 'TEL'],
        townServiceIds: ['nsl-main', 'tel-main'],
        townStationIds: ['NS1', 'TE1'],
        issueScope: {
          lineIds: ['TEL', 'EWL'],
          serviceIds: ['tel-main', 'ewl-main'],
          stationIds: ['TE1', 'EW1'],
        },
      }),
    ).toEqual({
      lineIds: ['NSL', 'TEL', 'EWL'],
      serviceIds: ['nsl-main', 'tel-main', 'ewl-main'],
      stationIds: ['NS1', 'TE1', 'EW1'],
    });
  });

  it('keeps a no-issue town scoped to its own planned station graph', () => {
    expect(
      mergeTownReadModelScope({
        townLineIds: ['JRL'],
        townServiceIds: ['jrl-main'],
        townStationIds: ['JS1', 'JS2'],
        issueScope: { lineIds: [], serviceIds: [], stationIds: [] },
      }),
    ).toEqual({
      lineIds: ['JRL'],
      serviceIds: ['jrl-main'],
      stationIds: ['JS1', 'JS2'],
    });
  });
});
