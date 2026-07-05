import { describe, expect, it } from 'vitest';
import {
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
