import { describe, expect, it } from 'vitest';
import {
  deriveLineStartedAtFromBranches,
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
      deriveLineStartedAtFromBranches('2026-07-02', [
        { startedAt: '2009-05-28', endedAt: '2020-01-01' },
        { startedAt: null, endedAt: null },
      ]),
    ).toBe('2026-07-02');
  });
});
