import { describe, expect, it } from 'vitest';
import { sortServiceRevisionsByRecency } from './serviceRevisions';

const updatedAt = new Date('2026-05-22T00:00:00.000Z');

describe('sortServiceRevisionsByRecency', () => {
  it('keeps active revisions ahead of ended legacy revisions', () => {
    const revisions = [
      {
        id: 'r_legacy_2002_2009',
        end_at: '2010-01-01',
        updated_at: updatedAt,
      },
      {
        id: 'r_2010',
        end_at: null,
        updated_at: updatedAt,
      },
    ];

    expect(
      sortServiceRevisionsByRecency(revisions).map((row) => row.id),
    ).toEqual(['r_2010', 'r_legacy_2002_2009']);
  });

  it('orders ended revisions by the most recent end date', () => {
    const revisions = [
      { id: 'r_2010', end_at: '2010-01-01', updated_at: updatedAt },
      { id: 'r_2020', end_at: '2020-01-01', updated_at: updatedAt },
    ];

    expect(
      sortServiceRevisionsByRecency(revisions).map((row) => row.id),
    ).toEqual(['r_2020', 'r_2010']);
  });

  it('falls back to updated time and id for otherwise equivalent revisions', () => {
    const revisions = [
      {
        id: 'r_a',
        end_at: null,
        updated_at: new Date('2026-05-22T00:00:00.000Z'),
      },
      {
        id: 'r_b',
        end_at: null,
        updated_at: new Date('2026-05-23T00:00:00.000Z'),
      },
    ];

    expect(
      sortServiceRevisionsByRecency(revisions).map((row) => row.id),
    ).toEqual(['r_b', 'r_a']);
  });
});
