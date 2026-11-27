import { describe, expect, it } from 'vitest';
import type { IssueInterval } from '~/types';
import { selectIssueInterval } from './useIssueInterval';

const january: IssueInterval = {
  startAt: '2025-01-01T08:00:00+08:00',
  endAt: '2025-01-01T10:00:00+08:00',
  status: 'ended',
};
const may: IssueInterval = {
  startAt: '2025-05-25T08:00:00+08:00',
  endAt: '2025-05-25T10:00:00+08:00',
  status: 'ended',
};

describe('selectIssueInterval', () => {
  it('selects an occurrence within a historical week', () => {
    expect(
      selectIssueInterval([may, january], {
        type: 'history.week',
        date: '2025-01-01',
      }),
    ).toBe(january);
  });

  it('falls back to the latest occurrence without mutating the source', () => {
    const intervals = [january, may];
    expect(
      selectIssueInterval(intervals, {
        type: 'history.days',
        date: '2026-11-01',
        days: 30,
      }),
    ).toBe(may);
    expect(intervals).toEqual([january, may]);
  });

  it('prefers an ongoing occurrence on a current card', () => {
    const ongoing: IssueInterval = { ...january, status: 'ongoing' };
    const future: IssueInterval = { ...may, status: 'future' };
    expect(selectIssueInterval([future, ongoing], { type: 'now' })).toBe(
      ongoing,
    );
  });
});
