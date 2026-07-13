import { describe, expect, it } from 'vitest';
import {
  countLineStations,
  deriveLineBranchMembershipReferenceDate,
  deriveLineStartedAtFromBranches,
  lineBranchHasEnded,
  lineBranchIsActiveOn,
  sortLineBranchesForCurrentView,
} from './lineBranches';

describe('sortLineBranchesForCurrentView', () => {
  it('keeps current branches before planned future branches', () => {
    const branches = [
      { id: 'future-loop', startedAt: null, endedAt: null },
      { id: 'current-main', startedAt: '2009-05-28', endedAt: null },
      { id: 'retired-shuttle', startedAt: '2009-05-28', endedAt: '2020-01-01' },
    ];

    expect(
      sortLineBranchesForCurrentView(branches).map((branch) => branch.id),
    ).toEqual(['current-main', 'future-loop', 'retired-shuttle']);
  });

  it('preserves source order within the same lifecycle group', () => {
    const branches = [
      { id: 'branch-b', startedAt: '2017-10-21', endedAt: null },
      { id: 'branch-a', startedAt: '2009-05-28', endedAt: null },
    ];

    expect(
      sortLineBranchesForCurrentView(branches).map((branch) => branch.id),
    ).toEqual(['branch-b', 'branch-a']);
  });

  it('treats future-dated closures as planned rather than retired', () => {
    const branches = [
      { id: 'retired', startedAt: '2009-05-28', endedAt: '2020-01-01' },
      { id: 'planned-stage', startedAt: '2027-01-01', endedAt: '2029-01-01' },
      { id: 'future-loop', startedAt: null, endedAt: null },
    ];

    expect(
      sortLineBranchesForCurrentView(branches, '2026-07-04').map(
        (branch) => branch.id,
      ),
    ).toEqual(['planned-stage', 'future-loop', 'retired']);
  });
});

describe('line branch lifecycle helpers', () => {
  it('does not mark a future end date as ended', () => {
    const branch = { startedAt: '2027-01-01', endedAt: '2029-01-01' };

    expect(lineBranchHasEnded(branch, '2026-07-04')).toBe(false);
    expect(lineBranchIsActiveOn(branch, '2026-07-04')).toBe(false);
  });

  it('treats started branches with a future end as active', () => {
    const branch = { startedAt: '2027-01-01', endedAt: '2029-01-01' };

    expect(lineBranchIsActiveOn(branch, '2028-01-01')).toBe(true);
    expect(lineBranchHasEnded(branch, '2030-01-01')).toBe(true);
  });

  it('treats the end date as an exclusive boundary', () => {
    const branch = { startedAt: '2009-05-28', endedAt: '2026-07-01' };

    expect(lineBranchIsActiveOn(branch, '2026-07-01')).toBe(false);
    expect(lineBranchHasEnded(branch, '2026-07-01')).toBe(true);
  });
});

describe('deriveLineBranchMembershipReferenceDate', () => {
  it('uses the current reference date for an active service', () => {
    expect(
      deriveLineBranchMembershipReferenceDate(
        { startedAt: '2020-01-01', endedAt: null },
        ['2027-01-01'],
        '2026-07-14',
      ),
    ).toBe('2026-07-14');
  });

  it('uses the final active day for an ended service', () => {
    expect(
      deriveLineBranchMembershipReferenceDate(
        { startedAt: '2020-01-01', endedAt: '2025-01-01' },
        [],
        '2026-07-14',
      ),
    ).toBe('2024-12-31');
  });

  it('uses the first membership date for a planned service', () => {
    expect(
      deriveLineBranchMembershipReferenceDate(
        { startedAt: null, endedAt: null },
        ['2028-06-30', '2035-01-01'],
        '2026-07-14',
      ),
    ).toBe('2028-06-30');
  });
});

describe('deriveLineStartedAtFromBranches', () => {
  it('keeps a currently served line from being treated as future service', () => {
    expect(
      deriveLineStartedAtFromBranches('2026-07-02', [
        { startedAt: null, endedAt: null },
        { startedAt: '2009-05-28', endedAt: null },
      ]),
    ).toBe('2009-05-28');
  });

  it('keeps future-only lines future', () => {
    expect(
      deriveLineStartedAtFromBranches('2026-07-02', [
        { startedAt: null, endedAt: null },
      ]),
    ).toBe('2026-07-02');
  });

  it('does not pull future lines back from retired-only service', () => {
    expect(
      deriveLineStartedAtFromBranches(
        '2026-07-02',
        [
          { startedAt: '2009-05-28', endedAt: '2020-01-01' },
          { startedAt: null, endedAt: null },
        ],
        '2026-07-04',
      ),
    ).toBe('2026-07-02');
  });

  it('can derive a future-only line start from a future branch with a planned end', () => {
    expect(
      deriveLineStartedAtFromBranches(
        '2029-01-01',
        [{ startedAt: '2027-01-01', endedAt: '2029-01-01' }],
        '2026-07-04',
      ),
    ).toBe('2027-01-01');
  });
});

describe('countLineStations', () => {
  const stations = {
    TE1: {
      memberships: [{ lineId: 'TEL', startedAt: '2024-06-23' }],
    },
    TE2: {
      memberships: [{ lineId: 'TEL', startedAt: '2024-06-23' }],
    },
    TE3: {
      memberships: [{ lineId: 'TEL', startedAt: '2027-01-01' }],
    },
    TE4: {
      memberships: [
        {
          lineId: 'TEL',
          startedAt: '2010-01-01',
          endedAt: '2024-01-01',
        },
      ],
    },
    EW1: {
      memberships: [{ lineId: 'EWL', startedAt: '1987-12-12' }],
    },
  };

  it('counts only active station memberships for lines already in service', () => {
    expect(
      countLineStations(stations, 'TEL', {
        includePlanned: false,
        referenceDate: '2026-07-04',
      }),
    ).toBe(2);
  });

  it('counts planned station memberships for future lines without including retired stations', () => {
    expect(
      countLineStations(stations, 'TEL', {
        includePlanned: true,
        referenceDate: '2026-07-04',
      }),
    ).toBe(3);
  });

  it('counts all planned line-code stations when selected future service paths are staged', () => {
    const jrlStations = Object.fromEntries(
      [
        'JS1',
        'JS2',
        'JS2A',
        'JS3',
        'JS4',
        'JS5',
        'JS6',
        'JS7',
        'JS8',
        'JS9',
        'JS10',
        'JS11',
        'JS12',
        'JE1',
        'JE2',
        'JE3',
        'JE4',
        'JE5',
        'JE6',
        'JE7',
        'JW1',
        'JW2',
        'JW3',
        'JW4',
        'JW5',
      ].map((code) => [
        code,
        {
          memberships: [
            {
              lineId: 'JRL',
              startedAt: code === 'JS2A' ? '2035-01-01' : '2028-06-30',
            },
          ],
        },
      ]),
    );

    expect(
      countLineStations(jrlStations, 'JRL', {
        includePlanned: true,
        referenceDate: '2026-07-04',
      }),
    ).toBe(25);
  });
});
